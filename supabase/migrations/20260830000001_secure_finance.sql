-- Migration: 20260830000001_secure_finance.sql
-- Description: Implement strict database-level wallet security, secure delivery verification, and finance analytics fixes.

-- 1. Secure wallet_balance and cod_wallet_liability in profiles
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    
    IF auth.uid() = NEW.id AND (v_caller_role IS NULL OR v_caller_role != 'admin') THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Cannot modify role directly';
        END IF;
        IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
            RAISE EXCEPTION 'Cannot modify suspension status directly';
        END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
            RAISE EXCEPTION 'Cannot modify employee ID directly';
        END IF;
        IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
            RAISE EXCEPTION 'Cannot modify warehouse directly';
        END IF;
        IF NEW.is_pending_staff IS DISTINCT FROM OLD.is_pending_staff THEN
            RAISE EXCEPTION 'Cannot modify pending staff status directly';
        END IF;
    END IF;

    -- Strict Wallet Protection: Block modifications unless flagged by a trusted financial RPC
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR NEW.cod_wallet_liability IS DISTINCT FROM OLD.cod_wallet_liability THEN
        IF current_setting('flashgo.internal_mutation', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Cannot modify financial balances directly. Use authoritative RPCs.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Inject internal_mutation flag into existing financial RPCs
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_user_id UUID,
    p_address TEXT,
    p_delivery_speed TEXT,
    p_payment_method TEXT,
    p_items JSONB, 
    p_coupon_code TEXT DEFAULT NULL,
    p_discount_val DECIMAL DEFAULT 0,
    p_delivery_fee DECIMAL DEFAULT 0,
    p_lat DOUBLE PRECISION DEFAULT 13.3427,
    p_lng DOUBLE PRECISION DEFAULT 74.7472,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total_amount DECIMAL(12,2) := 0;
    v_item JSONB;
    v_product_id UUID;
    v_qty INTEGER;
    v_price DECIMAL(10,2);
    v_item_total DECIMAL(12,2);
    v_stock INTEGER;
    v_wallet_balance DECIMAL(12,2);
BEGIN
    -- Flag authorized mutation
    PERFORM set_config('flashgo.internal_mutation', 'true', true);
    
    -- Calculate Subtotal & Verify Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_qty := (v_item->>'quantity')::INTEGER;
        
        SELECT COALESCE(discount_price, price), stock_quantity INTO v_price, v_stock 
        FROM public.products WHERE id = v_product_id;
        
        IF v_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
        END IF;
        
        v_item_total := v_price * v_qty;
        v_total_amount := v_total_amount + v_item_total;
    END LOOP;

    -- Apply Discount and Fees
    IF p_coupon_code IS NOT NULL AND p_discount_val > 0 THEN
        v_total_amount := GREATEST(v_total_amount - p_discount_val, 0);
    END IF;
    v_total_amount := v_total_amount + p_delivery_fee;

    -- Handle Wallet Payment Deduction
    IF p_payment_method = 'wallet' THEN
        SELECT wallet_balance INTO v_wallet_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
        IF v_wallet_balance < v_total_amount THEN
            RAISE EXCEPTION 'Insufficient wallet balance';
        END IF;
        
        -- Safe update due to flag
        UPDATE public.profiles SET wallet_balance = wallet_balance - v_total_amount WHERE id = p_user_id;
        
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (p_user_id, v_total_amount, 'debit', 'Checkout Order');
    END IF;

    -- Insert Order
    INSERT INTO public.orders (
        customer_id, delivery_address, total_amount, payment_method, status, 
        coupon_code, discount_amount, delivery_fee, lat, lng,
        payment_status
    )
    VALUES (
        p_user_id, p_address, v_total_amount, p_payment_method, 'placed', 
        p_coupon_code, p_discount_val, p_delivery_fee, p_lat, p_lng,
        CASE WHEN p_payment_method = 'wallet' THEN 'paid' ELSE 'pending' END
    ) RETURNING id INTO v_order_id;

    -- Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_qty := (v_item->>'quantity')::INTEGER;
        
        SELECT COALESCE(discount_price, price) INTO v_price FROM public.products WHERE id = v_product_id;
        
        INSERT INTO public.order_items (order_id, product_id, quantity, price_at_time)
        VALUES (v_order_id, v_product_id, v_qty, v_price);
        
        -- Create physical inventory reservation (this triggers global stock sync)
        INSERT INTO public.inventory_reservations (product_id, order_id, reserved_quantity, status)
        VALUES (v_product_id, v_order_id, v_qty, 'pending');
    END LOOP;
    
    -- Insert Payment Transaction
    IF p_payment_method != 'cod' THEN
        INSERT INTO public.payment_transactions (
            order_id, user_id, amount, payment_method, status, idempotency_key
        ) VALUES (
            v_order_id, p_user_id, v_total_amount, p_payment_method,
            CASE WHEN p_payment_method = 'wallet' THEN 'paid' ELSE 'pending' END,
            p_idempotency_key
        );
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.process_refund(
    p_order_id UUID,
    p_amount DECIMAL,
    p_reason TEXT,
    p_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_payment_transaction RECORD;
    v_total_refunded DECIMAL(12,2);
    v_refund_id UUID;
    v_wallet_balance DECIMAL(12,2);
BEGIN
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.payment_status != 'paid' THEN
        RAISE EXCEPTION 'Cannot refund an order that is not in paid status. Current status: %', v_order.payment_status;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded FROM public.refunds WHERE order_id = p_order_id AND status = 'completed';
    IF (v_total_refunded + p_amount) > v_order.total_amount THEN
        RAISE EXCEPTION 'Refund amount (%) exceeds remaining refundable amount (%)', p_amount, (v_order.total_amount - v_total_refunded);
    END IF;

    SELECT * INTO v_payment_transaction FROM public.payment_transactions 
    WHERE order_id = p_order_id AND status = 'paid' LIMIT 1;
    
    IF v_order.payment_method = 'wallet' THEN
        SELECT wallet_balance INTO v_wallet_balance FROM public.profiles WHERE id = v_order.customer_id FOR UPDATE;
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = v_order.customer_id;
        
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (v_order.customer_id, p_amount, 'credit', p_reason);
    END IF;

    INSERT INTO public.refunds (
        order_id, customer_id, payment_transaction_id, amount, reason, status, idempotency_key
    ) VALUES (
        p_order_id, v_order.customer_id, v_payment_transaction.id, p_amount, p_reason, 'completed', p_idempotency_key
    ) RETURNING id INTO v_refund_id;

    IF (v_total_refunded + p_amount) = v_order.total_amount THEN
        UPDATE public.orders SET payment_status = 'refunded', updated_at = now() WHERE id = p_order_id;
        UPDATE public.payment_transactions SET status = 'refunded', updated_at = now() WHERE order_id = p_order_id AND status = 'paid';
    END IF;

    RETURN v_refund_id;
END;
$$;


CREATE OR REPLACE FUNCTION register_cod_delivery(
    p_order_id UUID,
    p_driver_id UUID,
    p_amount DECIMAL
) RETURNS BOOLEAN AS $$
BEGIN
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    INSERT INTO public.cod_collections (order_id, driver_id, amount, status)
    VALUES (p_order_id, p_driver_id, p_amount, 'pending')
    ON CONFLICT (order_id) DO NOTHING;

    UPDATE public.profiles 
    SET cod_wallet_liability = COALESCE(cod_wallet_liability, 0) + p_amount 
    WHERE id = p_driver_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Enhance mark_cod_collected to enforce Admin authorization, reduce liability, and mark paid.
CREATE OR REPLACE FUNCTION mark_cod_collected(
    p_order_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_collection_id UUID;
    v_status cod_status;
    v_driver_id UUID;
    v_amount DECIMAL;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Only Admins can mark COD as collected';
    END IF;

    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    SELECT id, status, driver_id, amount INTO v_collection_id, v_status, v_driver_id, v_amount 
    FROM public.cod_collections 
    WHERE order_id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_status != 'pending' THEN
        RETURN TRUE; -- Idempotent
    END IF;

    -- Mark collected
    UPDATE public.cod_collections 
    SET status = 'collected', collected_by = auth.uid(), collected_at = now(), updated_at = now()
    WHERE id = v_collection_id;

    -- Reduce Driver Liability
    UPDATE public.profiles 
    SET cod_wallet_liability = GREATEST(COALESCE(cod_wallet_liability, 0) - v_amount, 0)
    WHERE id = v_driver_id;

    -- Mark Order Paid
    UPDATE public.orders SET payment_status = 'paid', updated_at = now() WHERE id = p_order_id;
    -- Wait, does payment_transactions have a COD record? 
    -- The original checkout says "IF p_payment_method != 'cod' THEN INSERT INTO payment_transactions". So COD doesn't have a payment_transaction initially?
    -- Actually, Page 8 Analytics relies on payment_transactions having COD rows! Let's check init schema.

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Driver Earnings Architecture
-- Ensure earning idempotency
ALTER TABLE public.driver_earnings ADD CONSTRAINT driver_earnings_order_id_key UNIQUE (order_id);
-- Ensure no unauthorized direct manipulation
ALTER TABLE public.driver_earnings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Select driver earnings" ON public.driver_earnings FOR SELECT USING (auth.uid() = driver_id OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- The new atomic delivery validation RPC
CREATE OR REPLACE FUNCTION driver_verify_delivery(
    p_order_id UUID,
    p_otp TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_order public.orders;
BEGIN
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'out_for_delivery' THEN RAISE EXCEPTION 'Order not out for delivery'; END IF;
    IF v_order.driver_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized: order assigned to different driver'; END IF;
    IF v_order.otp_code != p_otp THEN RAISE EXCEPTION 'Invalid OTP'; END IF;
    
    -- Transition order
    UPDATE public.orders SET status = 'delivered', updated_at = now() WHERE id = p_order_id;
    
    -- Generate Authoritative Earning: Fixed 7.00 earning + 1.50 commission
    INSERT INTO public.driver_earnings (driver_id, order_id, earning_amount, commission_amount)
    VALUES (auth.uid(), p_order_id, 7.00, 1.50)
    ON CONFLICT (order_id) DO NOTHING;
    
    -- Credit Driver Wallet 
    UPDATE public.profiles SET wallet_balance = wallet_balance + 7.00 WHERE id = auth.uid();
    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (auth.uid(), 7.00, 'credit', 'Delivery Earning');

    -- Assign COD Liability if applicable
    IF v_order.payment_method = 'cod' THEN
        PERFORM register_cod_delivery(p_order_id, auth.uid(), v_order.total_amount);
    END IF;

    -- Complete trip if this is the last order? 
    -- We assume complete_trip is handled separately or by the frontend updating driver status.
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Fix Analytics
CREATE OR REPLACE FUNCTION public.get_finance_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cod_pending numeric;
  v_cod_collected numeric;
  v_driver_payouts numeric;
  v_platform_commission numeric;
BEGIN
  -- Sum up directly from orders to avoid payment_transactions missing rows
  SELECT COALESCE(SUM(total_amount), 0) INTO v_cod_pending 
  FROM public.orders 
  WHERE payment_method = 'cod' AND payment_status = 'pending';
  
  SELECT COALESCE(SUM(total_amount), 0) INTO v_cod_collected 
  FROM public.orders 
  WHERE payment_method = 'cod' AND payment_status = 'paid';

  -- Driver Earnings
  SELECT COALESCE(SUM(earning_amount), 0) INTO v_driver_payouts
  FROM public.driver_earnings;

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_platform_commission
  FROM public.driver_earnings;

  RETURN json_build_object(
    'cod_pending', v_cod_pending,
    'cod_collected', v_cod_collected,
    'driver_earnings_total', v_driver_payouts,
    'platform_commission_total', v_platform_commission
  );
END;
$$;
