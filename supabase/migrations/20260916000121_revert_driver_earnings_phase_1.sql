-- Revert claim_trip to pre-119 state
CREATE OR REPLACE FUNCTION public.claim_trip(p_trip_id UUID, p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offer_id UUID;
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
BEGIN
    -- Lock driver to serialize assignments
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_driver_role, v_is_online, v_is_suspended
    FROM public.profiles
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;
    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account is suspended';
    END IF;
    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver is not online';
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = p_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RAISE EXCEPTION 'No active operational session';
    END IF;

    -- Lock the specific offer
    SELECT id INTO v_offer_id
    FROM public.driver_trip_offers
    WHERE trip_id = p_trip_id AND driver_id = p_driver_id AND status = 'offered' AND expires_at > NOW()
    FOR UPDATE;

    IF v_offer_id IS NULL THEN
        RAISE EXCEPTION 'EXPIRED_OFFER';
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'Driver already has an active trip';
    END IF;

    -- Lock trip FOR UPDATE
    SELECT status INTO v_trip_status
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or no longer pending';
    END IF;

    -- Mark offer accepted
    UPDATE public.driver_trip_offers
    SET status = 'accepted', responded_at = NOW()
    WHERE id = v_offer_id;

    -- Update trip 
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_trip_id;

    -- Sync order driver_id
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = NOW()
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$;

-- Revert driver_complete_delivery to pre-120 state
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_trip_id UUID, p_cod_collected BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_otp_rec RECORD;
    v_driver_email TEXT;
    v_is_test_driver BOOLEAN := false;
BEGIN
    SELECT email INTO v_driver_email FROM auth.users WHERE id = v_driver_id;
    IF v_driver_email = 'drivarrr1@gmail.com' THEN
        v_is_test_driver := true;
    END IF;

    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.arrived_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ARRIVED');
    END IF;

    -- The Edge function should have populated this before this RPC is called.
    -- Bypass this check ONLY for the specific test driver account.
    IF v_trip.route_distance_meters IS NULL THEN
        IF NOT v_is_test_driver THEN
            RETURN jsonb_build_object('success', false, 'code', 'ROUTE_DISTANCE_UNAVAILABLE');
        END IF;
    END IF;

    -- SECURE CONCURRENCY: Lock the order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1 FOR UPDATE;
    
    -- OTP Requirement Check
    IF v_order.total_amount > 1000 THEN
        SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = v_order.id;
        IF v_otp_rec.status != 'verified' THEN
             RETURN jsonb_build_object('success', false, 'code', 'OTP_REQUIRED');
        END IF;
    END IF;
    
    -- COD Requirement Check
    IF v_order.payment_method = 'cod' THEN
        IF NOT p_cod_collected AND NOT COALESCE(v_order.cod_collected, false) THEN
             RETURN jsonb_build_object('success', false, 'code', 'COD_NOT_COLLECTED');
        END IF;
        
        -- Mark COD collected. We only fire if false to remain idempotent.
        -- The unique index on driver_financial_ledger acts as a double-guard.
        IF NOT COALESCE(v_order.cod_collected, false) THEN
            UPDATE public.orders SET cod_collected = true, updated_at = NOW() WHERE id = v_order.id;
        END IF;
    END IF;
    
    -- Complete Trip (Idempotently preserve delivered_at if called twice by accident, though status check prevents this)
    UPDATE public.logistics_trips 
    SET status = 'completed', 
        delivered_at = COALESCE(delivered_at, NOW()),
        updated_at = NOW() 
    WHERE id = p_trip_id;
    
    -- Complete Order
    UPDATE public.orders SET status = 'delivered', updated_at = NOW() WHERE id = v_order.id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'delivered', 'in_transit', 'delivered', 'Delivery completed', jsonb_build_object('cod_collected', p_cod_collected), NULL);
        
    -- Check long distance return (> 5000 meters route distance)
    IF v_trip.route_distance_meters IS NOT NULL AND v_trip.route_distance_meters > 5000 THEN
        INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id)
        VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id)
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- Drop internal earning helper
DROP FUNCTION IF EXISTS public.internal_create_driver_delivery_earning(UUID);

-- Remove Phase 1 Snapshot Columns
ALTER TABLE public.logistics_trips
DROP COLUMN IF EXISTS driver_pay_config_id,
DROP COLUMN IF EXISTS driver_base_pay_snapshot,
DROP COLUMN IF EXISTS driver_included_distance_km_snapshot,
DROP COLUMN IF EXISTS driver_extra_per_km_rate_snapshot;

-- Remove config triggers
DROP TRIGGER IF EXISTS enforce_config_immutability ON public.driver_pay_configs;
DROP TRIGGER IF EXISTS enforce_config_immutability_insert ON public.driver_pay_configs;
DROP FUNCTION IF EXISTS public.prevent_historical_config_updates();

-- Drop config table
DROP TABLE IF EXISTS public.driver_pay_configs CASCADE;
