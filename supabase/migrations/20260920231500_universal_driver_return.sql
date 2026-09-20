-- Migration: 20260920231500_universal_driver_return.sql
-- Description: Universal post-delivery return to store, schema-level duplicate prevention, and strict QR validation.

-- 1. Narrow database-level uniqueness to prevent duplicate standard post-delivery return tasks
CREATE UNIQUE INDEX IF NOT EXISTS driver_return_tasks_standard_trip_idx 
ON public.driver_return_tasks (trip_id) 
WHERE status = 'required' AND return_type = 'standard';

-- 2. Universally create return tasks after delivery
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
    v_driver_email TEXT;
    v_is_test_driver BOOLEAN := false;

    v_total_units INTEGER := 0;
    v_rate_card_id UUID;
    v_tier RECORD;
    v_earning_amount NUMERIC(10,2);
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

-- 3. Fix driver_complete_return_to_store to securely validate QR and preserve geofence
CREATE OR REPLACE FUNCTION public.driver_complete_return_to_store(p_qr_token TEXT, p_lat FLOAT, p_lng FLOAT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_is_test_account BOOLEAN;
    v_distance_meters FLOAT;
    v_qr_id UUID;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE driver_id = v_driver_id AND status = 'required' LIMIT 1 FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    -- Validate geofence strictly using check-in's 200m radius rule (established pattern)
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
    
    IF v_distance_meters > 200 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    -- Authoritative QR Validation
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_task.warehouse_id AND raw_token = p_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;
    
    UPDATE public.driver_return_tasks SET status = 'completed', completed_at = NOW() WHERE id = v_task.id;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
