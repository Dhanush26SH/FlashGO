-- Restore driver_get_active_delivery RPC response contract for warehouse coordinates.
--
-- Migration 83 (20260916000083_fix_driver_warehouse_lat_lng.sql) correctly fixed the
-- SQL column reference bug:
--   WRONG:  w.latitude / w.longitude  (columns do not exist)
--   FIXED:  w.lat / w.lng             (authoritative DDL: 20260813000000_phase1_foundation.sql)
--
-- However, migration 83 also changed the JSON response key names:
--   BEFORE: 'latitude', w.lat  |  'longitude', w.lng
--   AFTER:  'lat', w.lat       |  'lng', w.lng
--
-- DriverReachDropScreen.tsx (lines 55-56) consumes the RPC response and expects:
--   data.warehouse.latitude
--   data.warehouse.longitude
--
-- This is the authoritative stable contract. Changing the JSON key names was not required
-- to fix the SQL bug and breaks DriverReachDropScreen's coordinate mapping.
--
-- This migration restores the JSON response keys to 'latitude'/'longitude' while keeping
-- the correct SQL source columns w.lat/w.lng.

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

    -- Build sanitized result.
    -- SQL source: w.lat / w.lng (authoritative warehouses DDL columns, migration 20260813000000)
    -- JSON keys:  latitude / longitude (stable RPC contract consumed by DriverReachDropScreen.tsx)
    SELECT jsonb_build_object(
        'success', true,
        'trip', jsonb_build_object(
            'id', lt.id,
            'status', lt.status
        ),
        -- Warehouse pickup location.
        -- SQL source: w.lat / w.lng (correct DDL columns, fixed from erroneous w.latitude/w.longitude in migration 74)
        -- JSON keys: latitude / longitude (stable contract — consumed by DriverReachDropScreen.tsx lines 55-56)
        'warehouse', jsonb_build_object(
            'id', w.id,
            'name', w.name,
            'address', w.address,
            'latitude', w.lat,
            'longitude', w.lng
        ),
        -- First order in trip (single-order trips for now)
        'order', jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'status', o.status,
            'total_amount', o.total_amount,
            -- Picker details (only name — no sensitive info)
            'picker_name', COALESCE(picker.full_name, 'Assigning'),
            -- Customer details — ONLY name and phone for delivery
            'customer_name', COALESCE(o.customer_name_snapshot, cust.full_name),
            'customer_phone', cust.phone,
            'delivery_address', o.delivery_address,
            'delivery_lat', o.delivery_lat,
            'delivery_lng', o.delivery_lng,
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
