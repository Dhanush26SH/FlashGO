-- Migration: 20261004000006_fix_cod_customer_payment_status.sql
-- Fixes Driver Complete Delivery RPC to set customer payment status to 'paid' when COD is collected

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
        
        -- Mark COD collected AND customer payment paid.
        IF NOT COALESCE(v_order.cod_collected, false) THEN
            UPDATE public.orders 
            SET cod_collected = true, 
                payment_status = 'paid', 
                updated_at = NOW() 
            WHERE id = v_order.id;
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

-- Repair explicitly identified historical rows (18 expected)
UPDATE public.orders
SET payment_status = 'paid', updated_at = NOW()
WHERE payment_method = 'cod' 
  AND status = 'delivered' 
  AND cod_collected = true 
  AND payment_status = 'pending';
