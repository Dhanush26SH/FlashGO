-- Migration: 20260916000026_backend_osrm_and_concurrency.sql
-- Description:
-- 1. Add delivered_at and ensure precise timings.
-- 2. Modify driver_complete_delivery to read pre-populated route_distance_meters.
-- 3. Secure orders concurrency with FOR UPDATE.
-- 4. Add unique index to driver_financial_ledger to guarantee exactly-once COD collection.

ALTER TABLE public.logistics_trips
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Guarantee Exactly-Once COD collection in the ledger
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_ledger_unique_cod_collection 
ON public.driver_financial_ledger (driver_id, source_reference_id)
WHERE transaction_type = 'cod_collection';

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

    -- The Edge function should have populated this before this RPC is called
    IF v_trip.route_distance_meters IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ROUTE_DISTANCE_UNAVAILABLE');
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
    
    -- Check long distance return (> 5000 meters route distance)
    IF v_trip.route_distance_meters > 5000 THEN
        INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id)
        VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id)
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
