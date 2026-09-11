-- Migration: 20260916000023_driver_pickup_rpc.sql
-- Description: 
--   1. Secure driver_get_active_delivery() RPC - returns full sanitized delivery details for Driver's active trip
--   2. driver_confirm_order_pickup(p_trip_id) RPC - atomic pickup confirmation
--   Picker readiness signal: orders.status = 'handed_off' (set by execute_worker_handover)
--   After pickup: trip → 'in_transit', orders → 'out_for_delivery'

-- ============================================================
-- PART 1: Secure Driver Active Delivery Feed
-- Exposes ONLY the fields needed for the pickup screen
-- Derives driver from auth.uid() - no client parameter
-- ============================================================
CREATE OR REPLACE FUNCTION public.driver_get_active_delivery()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_role TEXT;
    v_is_online BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_trip RECORD;
    v_result JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, is_online INTO v_role, v_is_online FROM public.profiles WHERE id = v_driver_id;
    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    -- Active session check
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Get active trip (accepted or in_transit)
    SELECT lt.id, lt.status, lt.warehouse_id
    INTO v_trip
    FROM public.logistics_trips lt
    WHERE lt.driver_id = v_driver_id AND lt.status IN ('accepted', 'in_transit')
    LIMIT 1;

    IF v_trip.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'trip', NULL);
    END IF;

    -- Build sanitized result
    SELECT jsonb_build_object(
        'success', true,
        'trip', jsonb_build_object(
            'id', lt.id,
            'status', lt.status
        ),
        -- Warehouse details from the authoritative trip, not profile
        'warehouse', jsonb_build_object(
            'id', w.id,
            'name', w.name,
            'address', w.address
        ),
        -- First order in trip (single-order trips for now)
        'order', jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'status', o.status,
            'total_amount', o.total_amount,
            -- Picker details (only name - no sensitive info)
            'picker_name', COALESCE(picker.full_name, 'Assigning'),
            -- Customer details - ONLY name and phone for delivery
            'customer_name', COALESCE(o.customer_name_snapshot, cust.full_name),
            'customer_phone', cust.phone,
            'delivery_address', o.delivery_address,
            -- Readiness: handed_off means Picker has completed handover
            'picker_ready', (o.status = 'handed_off'),
            -- Items with product info
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', oi.id,
                    'quantity', oi.quantity,
                    'picked_quantity', oi.picked_quantity,
                    'product_name', p.name,
                    'product_image', p.image_url
                ) ORDER BY oi.id)
                FROM public.order_items oi
                JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id = o.id
            ),
            -- Total item count (sum of quantities)
            'total_item_count', (
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            )
        )
    ) INTO v_result
    FROM public.logistics_trips lt
    JOIN public.warehouses w ON lt.warehouse_id = w.id
    JOIN public.orders o ON o.trip_id = lt.id AND o.status NOT IN ('cancelled')
    JOIN public.profiles cust ON cust.id = o.customer_id
    LEFT JOIN public.profiles picker ON picker.id = o.picker_id
    WHERE lt.id = v_trip.id
    LIMIT 1;

    RETURN COALESCE(v_result, jsonb_build_object('success', true, 'trip', NULL));
END;
$$;

-- Helper: snapshot column may not exist - safely add if not present
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name_snapshot TEXT;


-- ============================================================
-- PART 2: Atomic Driver Pickup Confirmation
-- Derives driver from auth.uid() - no driver_id from client
-- Verifies: driver owns trip, picker has completed handover (handed_off)
-- Transitions: trip → in_transit, orders → out_for_delivery
-- Idempotent: safe to call twice (returns true if already in_transit)
-- ============================================================
CREATE OR REPLACE FUNCTION public.driver_confirm_order_pickup(p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_trip_status TEXT;
    v_trip_driver_id UUID;
    v_order_status TEXT;
    v_order_id UUID;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, is_online, COALESCE(is_suspended, false)
    INTO v_role, v_is_online, v_is_suspended
    FROM public.profiles WHERE id = v_driver_id;

    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;
    IF v_is_suspended THEN
        RETURN jsonb_build_object('success', false, 'code', 'SUSPENDED');
    END IF;
    IF NOT v_is_online THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFLINE');
    END IF;

    -- Session check
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Lock the trip
    SELECT status, driver_id INTO v_trip_status, v_trip_driver_id
    FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'TRIP_NOT_FOUND');
    END IF;
    IF v_trip_driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;

    -- Idempotent: already in transit
    IF v_trip_status = 'in_transit' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_IN_TRANSIT');
    END IF;

    IF v_trip_status != 'accepted' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRIP_STATUS', 'status', v_trip_status);
    END IF;

    -- Verify picker has handed over (orders.status = 'handed_off')
    SELECT id, status INTO v_order_id, v_order_status
    FROM public.orders
    WHERE trip_id = p_trip_id AND status NOT IN ('cancelled')
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ORDER_ON_TRIP');
    END IF;

    IF v_order_status != 'handed_off' THEN
        RETURN jsonb_build_object('success', false, 'code', 'PICKER_NOT_READY', 'order_status', v_order_status);
    END IF;

    -- All checks passed — transition atomically
    UPDATE public.logistics_trips
    SET status = 'in_transit', updated_at = NOW()
    WHERE id = p_trip_id;

    -- Transition all non-cancelled orders in this trip to out_for_delivery
    UPDATE public.orders
    SET status = 'out_for_delivery', updated_at = NOW()
    WHERE trip_id = p_trip_id AND status NOT IN ('cancelled', 'delivered');

    RETURN jsonb_build_object('success', true, 'code', 'PICKUP_CONFIRMED');
END;
$$;
