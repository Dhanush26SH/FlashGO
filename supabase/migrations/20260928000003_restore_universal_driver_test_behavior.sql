-- Restore universal Driver testing behavior for college demo environment
-- This supersedes the complex Demo state and universally bypasses physical geofences for all approved drivers.

-- 1. driver_shift_check_in (Bypass warehouse geofence universally)
CREATE OR REPLACE FUNCTION public.driver_shift_check_in(p_shift_id UUID, p_lat FLOAT, p_lng FLOAT, p_raw_qr_token TEXT, p_is_demo BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_driver_role TEXT;
    v_driver_suspended BOOLEAN;
    v_shift_staff_id UUID;
    v_shift_status TEXT;
    v_shift_wh UUID;
    v_shift_start TIMESTAMPTZ;
    v_shift_end TIMESTAMPTZ;
    v_wh_lat FLOAT;
    v_wh_lng FLOAT;
    v_distance FLOAT;
    v_qr_id UUID;
    v_result JSONB;
    v_late_minutes INTEGER;
    v_is_late BOOLEAN := false;
    v_penalty_text TEXT;
    v_penalty_amount NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, is_suspended INTO v_driver_role, v_driver_suspended
    FROM public.profiles WHERE id = auth.uid();
    
    IF v_driver_role != 'driver' OR v_driver_suspended = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    SELECT staff_id, status, warehouse_id, shift_start, shift_end
    INTO v_shift_staff_id, v_shift_status, v_shift_wh, v_shift_start, v_shift_end
    FROM public.staff_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_FOUND');
    END IF;

    IF v_shift_staff_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_OWNED');
    END IF;

    IF v_shift_status != 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_SCHEDULED');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.driver_check_in_records
        WHERE driver_id = auth.uid() AND staff_shift_id = p_shift_id AND status = 'SUCCESS'
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN');
    END IF;

    IF NOW() < (v_shift_start - interval '30 minutes') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, 'FAILED', 'TOO_EARLY');
        RETURN jsonb_build_object('success', false, 'code', 'TOO_EARLY');
    END IF;

    IF NOW() > v_shift_start THEN
        v_late_minutes := CEIL(EXTRACT(EPOCH FROM (NOW() - v_shift_start)) / 60.0);
    ELSE
        v_late_minutes := 0;
    END IF;

    IF NOW() >= v_shift_end THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, 'FAILED', 'CHECK_IN_WINDOW_EXPIRED');
        RETURN jsonb_build_object('success', false, 'code', 'CHECK_IN_WINDOW_EXPIRED');
    END IF;

    IF v_late_minutes > 0 THEN
        v_is_late := true;
    END IF;

    SELECT lat, lng INTO v_wh_lat, v_wh_lng
    FROM public.warehouses WHERE id = v_shift_wh;

    IF v_wh_lat IS NULL OR v_wh_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, 'FAILED', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
    END IF;

    v_distance := public.calculate_haversine_distance(p_lat, p_lng, v_wh_lat, v_wh_lng);

    -- UNIVERSAL BYPASS: We calculate distance but NEVER fail on OUTSIDE_WAREHOUSE_GEOFENCE for any approved driver

    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift_wh AND raw_token = p_raw_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, 'FAILED', 'INVALID_QR_TOKEN');
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    UPDATE public.staff_shifts SET status = 'active' WHERE id = p_shift_id;
    
    INSERT INTO public.driver_sessions (driver_id, status, latest_lat, latest_lng, staff_shift_id, updated_at)
    VALUES (auth.uid(), 'active', p_lat, p_lng, p_shift_id, NOW())
    ON CONFLICT (driver_id) WHERE status = 'active'
    DO UPDATE SET staff_shift_id = p_shift_id, latest_lat = p_lat, latest_lng = p_lng, updated_at = NOW();

    INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, qr_challenge_id, status, is_late, late_by_minutes)
    VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, v_qr_id, 'SUCCESS', v_is_late, v_late_minutes);

    IF v_is_late THEN
        BEGIN
            SELECT value INTO v_penalty_text FROM public.app_settings WHERE key = 'late_check_in_penalty_amount';
            IF v_penalty_text IS NOT NULL THEN
                v_penalty_amount := v_penalty_text::NUMERIC;
            ELSE
                v_penalty_amount := 0;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_penalty_amount := 0;
        END;

        IF v_penalty_amount > 0 THEN
            INSERT INTO public.driver_financial_ledger (
                driver_id, amount, transaction_type, source_reference_id, description, created_by
            ) VALUES (
                auth.uid(), -v_penalty_amount, 'penalty', p_shift_id, 'LATE_GIG_CHECK_IN', NULL
            ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'penalty' AND description = 'LATE_GIG_CHECK_IN' DO NOTHING;
        END IF;
    END IF;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$$;

-- 2. driver_verify_warehouse_arrival (Bypass geofence universally)
CREATE OR REPLACE FUNCTION public.driver_verify_warehouse_arrival(p_task_id UUID, p_lat FLOAT, p_lng FLOAT, p_is_demo BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_distance_meters FLOAT;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver_id AND role = 'driver' AND is_suspended = false) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = p_task_id AND driver_id = v_driver_id FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TASK');
    END IF;

    IF v_task.status != 'required' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TASK_NOT_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    IF v_warehouse.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_NOT_FOUND');
    END IF;

    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);

    -- UNIVERSAL BYPASS: We calculate distance but NEVER fail on TOO_FAR for any approved driver

    UPDATE public.driver_return_tasks SET status = 'at_warehouse', updated_at = NOW() WHERE id = p_task_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. driver_mark_arrived (Bypass 150m check universally, keep 4-arg signature)
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT);
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT, DECIMAL);

CREATE OR REPLACE FUNCTION public.driver_mark_arrived(p_trip_id UUID, p_driver_lat FLOAT, p_driver_lng FLOAT, p_route_distance_meters DECIMAL DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_distance_meters FLOAT;
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.status != 'in_transit' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_IN_TRANSIT');
    END IF;
    IF v_trip.arrived_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ARRIVED');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ORDER');
    END IF;

    IF v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
         v_distance_meters := 0;
    ELSE
         v_distance_meters := public.calculate_haversine_distance(p_driver_lat, p_driver_lng, v_order.delivery_lat, v_order.delivery_lng);
         -- UNIVERSAL BYPASS: We calculate distance but NEVER fail on TOO_FAR for any approved driver
    END IF;

    UPDATE public.logistics_trips 
    SET arrived_at = NOW(),
        route_distance_meters = COALESCE(p_route_distance_meters, route_distance_meters),
        updated_at = NOW()
    WHERE id = p_trip_id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'driver_arrived', 'out_for_delivery', 'arrived', 'Driver arrived at delivery location', '{}'::jsonb, NULL);
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. driver_complete_delivery (Bypass missing route_distance_meters universally, preserving financial engine)
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_trip_id uuid, p_cod_collected boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_otp_rec RECORD;
    v_total_units INTEGER := 0;
    v_rate_card_id UUID;
    v_tier RECORD;
    v_earning_amount NUMERIC(10,2);
BEGIN
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

    -- UNIVERSAL BYPASS: We no longer strictly fail on ROUTE_DISTANCE_UNAVAILABLE for approved drivers
    -- If v_trip.route_distance_meters IS NULL, it just proceeds safely.

    -- SECURE CONCURRENCY: Lock the order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1 FOR UPDATE;
    
    -- OTP Requirement Check
    IF v_order.total_amount > 1000 THEN
        SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = v_order.id;
        IF v_otp_rec IS NULL OR v_otp_rec.status IS DISTINCT FROM 'verified' THEN
             RETURN jsonb_build_object('success', false, 'code', 'OTP_REQUIRED');
        END IF;
    END IF;
    
    -- COD Requirement Check (Isolated)
    IF v_order.payment_method = 'cod' THEN
        IF NOT p_cod_collected AND NOT COALESCE(v_order.cod_collected, false) THEN
             RETURN jsonb_build_object('success', false, 'code', 'COD_NOT_COLLECTED');
        END IF;
        
        -- Mark COD collected.
        IF NOT COALESCE(v_order.cod_collected, false) THEN
            UPDATE public.orders SET cod_collected = true, updated_at = NOW() WHERE id = v_order.id;
        END IF;

        -- AUTHORITATIVE COD COLLECTION FIX: Ensure the operational tracking row is created
        PERFORM public.register_cod_delivery(v_order.id, v_driver_id, v_order.total_amount);
    END IF;
    
    -- Complete Trip (Idempotently preserve delivered_at)
    UPDATE public.logistics_trips 
    SET status = 'completed', 
        delivered_at = COALESCE(delivered_at, NOW()),
        updated_at = NOW() 
    WHERE id = p_trip_id
    RETURNING delivered_at INTO v_trip.delivered_at;
    
    -- Complete Order
    UPDATE public.orders SET status = 'delivered', updated_at = NOW() WHERE id = v_order.id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'delivered', 'in_transit', 'delivered', 'Delivery completed', jsonb_build_object('cod_collected', p_cod_collected), NULL);
        
    -- Standard post-delivery return to store
    INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id, return_type)
    VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id, 'standard')
    ON CONFLICT (trip_id) WHERE status = 'required' AND return_type = 'standard' DO NOTHING;
    
    -- =========================================================
    -- FINANCIAL ENGINE (DELIVERY EARNINGS)
    -- =========================================================
    BEGIN
        -- Calculate Total Units
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_units
        FROM public.order_items
        WHERE order_id = v_order.id;

        IF v_total_units > 0 THEN
            -- Find the rate card effective at the exact time of completion
            SELECT id INTO v_rate_card_id
            FROM public.driver_earning_rate_cards
            WHERE warehouse_id = v_trip.warehouse_id
              AND effective_from <= v_trip.delivered_at
              AND status = 'active'
            ORDER BY effective_from DESC
            LIMIT 1;

            IF v_rate_card_id IS NOT NULL THEN
                -- Find matching tier
                SELECT * INTO v_tier
                FROM public.driver_earning_tiers
                WHERE rate_card_id = v_rate_card_id
                  AND int4range(min_items, CASE WHEN max_items IS NULL THEN NULL ELSE max_items + 1 END, '[)') @> v_total_units
                LIMIT 1;

                IF v_tier.id IS NOT NULL THEN
                    v_earning_amount := v_tier.earning_amount;
                    
                    -- Insert immutable earning via internal block ignoring duplication errors due to unique index
                    BEGIN
                        INSERT INTO public.driver_financial_ledger (
                            driver_id,
                            amount,
                            transaction_type,
                            order_id,
                            trip_id,
                            description,
                            metadata
                        )
                        VALUES (
                            v_driver_id,
                            v_earning_amount,
                            'delivery_earning',
                            v_order.id,
                            v_trip.id,
                            'Delivery Earning (' || v_total_units || ' items)',
                            jsonb_build_object(
                                'rate_card_id', v_rate_card_id,
                                'tier_id', v_tier.id,
                                'warehouse_id', v_trip.warehouse_id,
                                'total_units', v_total_units,
                                'min_items', v_tier.min_items,
                                'max_items', v_tier.max_items,
                                'earning_amount', v_earning_amount
                            )
                        );
                    EXCEPTION WHEN unique_violation THEN
                        -- Expected on rare retry race condition, safely ignore
                    END;
                ELSE
                    RAISE WARNING 'No driver earning tier matched for trip % (Units: %)', p_trip_id, v_total_units;
                END IF;
            ELSE
                RAISE WARNING 'No active driver earning rate card found for warehouse % at %', v_trip.warehouse_id, v_trip.delivered_at;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Swallow any financial calculation exceptions strictly so delivery remains successful.
        RAISE WARNING 'Driver financial calculation failed for trip %: %', p_trip_id, SQLERRM;
    END;

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- 5. driver_complete_return_to_store (Bypass Return-to-Store geofence universally)
CREATE OR REPLACE FUNCTION public.driver_complete_return_to_store(p_qr_token TEXT, p_lat FLOAT, p_lng FLOAT, p_is_demo BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_distance_meters FLOAT;
    v_qr_id UUID;
    v_waiting_allocation RECORD;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE driver_id = v_driver_id AND status = 'required' LIMIT 1 FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    
    -- UNIVERSAL BYPASS: We calculate distance but NEVER fail on TOO_FAR for any approved driver
    
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_task.warehouse_id AND raw_token = p_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;
    
    UPDATE public.driver_return_tasks SET status = 'completed', completed_at = NOW() WHERE id = v_task.id;
    
    SELECT dza.* INTO v_waiting_allocation FROM public.drop_zone_allocations dza
    WHERE dza.warehouse_id = v_warehouse.id AND dza.status = 'placed'
    ORDER BY dza.placed_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

    IF v_waiting_allocation.id IS NOT NULL THEN
        UPDATE public.drop_zone_allocations SET status = 'driver_assigned', driver_id = v_driver_id, driver_assigned_at = NOW() WHERE id = v_waiting_allocation.id;
        UPDATE public.logistics_trips SET status = 'accepted', driver_id = v_driver_id, updated_at = NOW() WHERE id = v_waiting_allocation.trip_id;
        UPDATE public.orders SET driver_id = v_driver_id, updated_at = NOW() WHERE id = v_waiting_allocation.order_id;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
