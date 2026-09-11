-- 20260831000003_secure_checkout_rpc_fix_columns.sql

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_user_id UUID,
    p_address TEXT,
    p_delivery_speed TEXT,
    p_payment_method TEXT,
    p_items JSONB, 
    p_coupon_code TEXT DEFAULT NULL,
    p_lat DOUBLE PRECISION DEFAULT 13.3427,
    p_lng DOUBLE PRECISION DEFAULT 74.7472,
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total_amount DECIMAL(12,2) := 0;
    v_subtotal DECIMAL(12,2) := 0;
    v_item JSONB;
    v_product_id UUID;
    v_qty INTEGER;
    v_price DECIMAL(10,2);
    v_item_total DECIMAL(12,2);
    v_stock INTEGER;
    v_wallet_balance DECIMAL(12,2);
    v_discount_val DECIMAL(12,2) := 0;
    v_delivery_fee DECIMAL(12,2) := 0;
    v_base_delivery_fee DECIMAL(12,2);
    v_free_delivery_threshold DECIMAL(12,2);
    v_coupon_record RECORD;
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
        v_subtotal := v_subtotal + v_item_total;
    END LOOP;

    -- Calculate Discount Authoritatively
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon_record FROM public.coupons 
        WHERE code = p_coupon_code AND active = true;
        
        IF FOUND AND v_subtotal >= v_coupon_record.min_order_value THEN
            IF v_coupon_record.discount_type = 'percentage' THEN
                v_discount_val := LEAST((v_subtotal * v_coupon_record.discount_value) / 100, COALESCE(v_coupon_record.max_discount, 1000));
            ELSE
                v_discount_val := v_coupon_record.discount_value;
            END IF;
        END IF;
    END IF;

    -- Fetch Platform Settings
    SELECT base_delivery_fee, free_delivery_threshold INTO v_base_delivery_fee, v_free_delivery_threshold 
    FROM public.platform_settings WHERE id = 1;

    IF v_base_delivery_fee IS NULL THEN
        v_base_delivery_fee := 2.99;
        v_free_delivery_threshold := 15.00;
    END IF;

    -- Calculate Delivery Fee
    IF v_subtotal >= v_free_delivery_threshold THEN
        v_delivery_fee := 0;
    ELSE
        v_delivery_fee := v_base_delivery_fee;
    END IF;

    -- Final Total Calculation
    v_total_amount := GREATEST(v_subtotal - v_discount_val, 0) + v_delivery_fee;

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
        coupon_code, discount_amount, delivery_fee, delivery_lat, delivery_lng,
        payment_status
    )
    VALUES (
        p_user_id, p_address, v_total_amount, p_payment_method, 'placed', 
        p_coupon_code, v_discount_val, v_delivery_fee, p_lat, p_lng,
        CASE WHEN p_payment_method = 'wallet' THEN 'paid' ELSE 'pending' END
    ) RETURNING id INTO v_order_id;

    -- Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_qty := (v_item->>'quantity')::INTEGER;
        
        SELECT COALESCE(discount_price, price) INTO v_price FROM public.products WHERE id = v_product_id;
        
        INSERT INTO public.order_items (order_id, product_id, quantity, price)
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
