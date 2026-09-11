-- Migration: 20260830000002_finance_closure.sql

-- Drop the redundant RPC I created
DROP FUNCTION IF EXISTS public.driver_verify_delivery;

-- Rewrite authoritative mark_order_delivered to be fully secure and integrate wallet
CREATE OR REPLACE FUNCTION public.mark_order_delivered(
    p_order_id UUID,
    p_otp VARCHAR,
    p_driver_id UUID,
    p_pod_url TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_trip_id UUID;
    v_undelivered_count INTEGER;
BEGIN
    -- Secure Wallet Mutations
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    -- Lock order
    SELECT id, status, driver_id, otp_code, total_amount, payment_method, trip_id 
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Order is not out for delivery';
    END IF;

    -- SECURITY: Enforce caller is actually the assigned driver
    IF auth.uid() IS NULL OR auth.uid() != v_order.driver_id THEN
        RAISE EXCEPTION 'Order is not assigned to this driver (auth mismatch)';
    END IF;
    
    -- Legacy arg check
    IF p_driver_id != v_order.driver_id THEN
        RAISE EXCEPTION 'Order is not assigned to this driver (arg mismatch)';
    END IF;

    -- Check trip exists
    IF v_order.trip_id IS NULL THEN
        RAISE EXCEPTION 'Order is not assigned to a valid active trip';
    END IF;

    IF v_order.otp_code != p_otp THEN
        RAISE EXCEPTION 'Invalid OTP';
    END IF;

    -- 1. Update order
    UPDATE public.orders
    SET status = 'delivered',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- 2. Insert Driver Earnings natively (7.00 earning, 1.50 commission)
    INSERT INTO public.driver_earnings (driver_id, order_id, earning_amount, commission_amount)
    VALUES (v_order.driver_id, p_order_id, 7.00, 1.50)
    ON CONFLICT (order_id) DO NOTHING;
    
    -- 2b. Credit Driver Wallet
    UPDATE public.profiles SET wallet_balance = COALESCE(wallet_balance, 0) + 7.00 WHERE id = v_order.driver_id;
    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (v_order.driver_id, 7.00, 'credit', 'Delivery Earning');

    -- 3. Register COD if needed
    IF v_order.payment_method = 'cod' THEN
        PERFORM public.register_cod_delivery(p_order_id, v_order.driver_id, v_order.total_amount);
    END IF;

    -- 4. Check if trip is completed
    v_trip_id := v_order.trip_id;
    
    -- Lock trip to prevent race conditions during concurrent order completions
    PERFORM id FROM public.logistics_trips WHERE id = v_trip_id FOR UPDATE;

    SELECT COUNT(*) INTO v_undelivered_count 
    FROM public.orders 
    WHERE trip_id = v_trip_id 
    AND status != 'delivered' AND status != 'cancelled';

    IF v_undelivered_count = 0 THEN
        UPDATE public.logistics_trips 
        SET status = 'completed',
            updated_at = timezone('utc'::text, now())
        WHERE id = v_trip_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Fix Analytics RPC to agree with Page 1 and relabel
CREATE OR REPLACE FUNCTION public.get_finance_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cod_pending numeric;
  v_cod_collected numeric;
  v_driver_earnings numeric;
  v_platform_commission numeric;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0) INTO v_cod_pending 
  FROM public.orders 
  WHERE payment_method = 'cod' AND payment_status = 'pending';
  
  SELECT COALESCE(SUM(total_amount), 0) INTO v_cod_collected 
  FROM public.orders 
  WHERE payment_method = 'cod' AND payment_status = 'paid';

  SELECT COALESCE(SUM(earning_amount), 0) INTO v_driver_earnings
  FROM public.driver_earnings;

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_platform_commission
  FROM public.driver_earnings;

  RETURN json_build_object(
    'cod_pending', v_cod_pending,
    'cod_collected', v_cod_collected,
    'driver_earnings_total', v_driver_earnings,
    'platform_commission_total', v_platform_commission
  );
END;
$$;
