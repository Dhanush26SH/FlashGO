-- 1. Create internal earning helper
CREATE OR REPLACE FUNCTION public.internal_create_driver_delivery_earning(p_trip_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip RECORD;
    v_order RECORD;
    v_distance_km NUMERIC(10,2);
    v_billable_extra_km NUMERIC(10,2);
    v_distance_pay NUMERIC(10,2);
    v_total_earning NUMERIC(10,2);
BEGIN
    -- 1. Load authoritative trip
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL THEN
        RAISE EXCEPTION 'Trip % not found', p_trip_id;
    END IF;

    -- 2. Verify state
    IF v_trip.status != 'completed' THEN
        RAISE EXCEPTION 'Trip must be completed to generate earning (Status: %)', v_trip.status;
    END IF;
    IF v_trip.delivered_at IS NULL THEN
        RAISE EXCEPTION 'Trip delivered_at is null';
    END IF;
    IF v_trip.route_distance_meters IS NULL THEN
        RAISE EXCEPTION 'Trip route_distance_meters is null';
    END IF;

    -- 3. Load order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id LIMIT 1;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order for trip % not found', p_trip_id;
    END IF;

    -- 4. Pre-migration compatibility check
    IF v_trip.driver_pay_config_id IS NULL THEN
        -- This trip was accepted before the new pay system. Do not fabricate earnings.
        -- We exit gracefully.
        RETURN;
    END IF;

    -- 5. Snapshot validation
    IF v_trip.driver_base_pay_snapshot IS NULL OR v_trip.driver_included_distance_km_snapshot IS NULL OR v_trip.driver_extra_per_km_rate_snapshot IS NULL THEN
        RAISE EXCEPTION 'Trip pay snapshot is incomplete despite having a config ID';
    END IF;

    -- 6. Math calculation
    v_distance_km := v_trip.route_distance_meters / 1000.0;
    v_billable_extra_km := GREATEST(0, v_distance_km - v_trip.driver_included_distance_km_snapshot);
    v_distance_pay := ROUND(v_billable_extra_km * v_trip.driver_extra_per_km_rate_snapshot, 2);
    v_total_earning := ROUND(v_trip.driver_base_pay_snapshot + v_distance_pay, 2);

    -- 7. Insert Ledger Transaction
    INSERT INTO public.driver_financial_ledger (
        driver_id,
        amount,
        transaction_type,
        order_id,
        trip_id,
        source_reference_id,
        description,
        occurred_at,
        created_by,
        metadata
    ) VALUES (
        v_trip.driver_id,
        v_total_earning,
        'delivery_earning',
        v_order.id,
        v_trip.id,
        v_trip.id,
        'Delivery Earning',
        NOW(),
        auth.uid(),
        jsonb_build_object(
            'pay_config_id', v_trip.driver_pay_config_id,
            'base_pay', v_trip.driver_base_pay_snapshot,
            'included_distance_km', v_trip.driver_included_distance_km_snapshot,
            'extra_per_km_rate', v_trip.driver_extra_per_km_rate_snapshot,
            'route_distance_meters', v_trip.route_distance_meters,
            'distance_km', v_distance_km,
            'billable_extra_km', v_billable_extra_km,
            'distance_pay', v_distance_pay,
            'total_delivery_earning', v_total_earning
        )
    ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'delivery_earning' DO NOTHING;

END;
$$;

-- Revoke execute from public
REVOKE EXECUTE ON FUNCTION public.internal_create_driver_delivery_earning(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_create_driver_delivery_earning(UUID) FROM authenticated;


-- 2. Modify driver_complete_delivery to call the helper
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
    
    -- NEW: Generate delivery earning transactionally
    PERFORM public.internal_create_driver_delivery_earning(p_trip_id);

    RETURN jsonb_build_object('success', true);
END;
$$;
