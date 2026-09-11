-- 20260827000004_fix_checkout_coupon.sql
-- Fix process_checkout to use inventory_reservations and secure coupons

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
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
    v_product RECORD;
    v_total_amount DECIMAL(12,2) := 0;
    v_subtotal DECIMAL(12,2) := 0;
    v_item_price DECIMAL(12,2);
    v_is_cold_chain BOOLEAN := FALSE;
    v_wallet_balance DECIMAL(12,2);
    v_final_payment_status TEXT := 'pending';
    
    v_warehouse RECORD;
    v_warehouse_id UUID;
    v_can_fulfill BOOLEAN;
    
    v_real_discount_val DECIMAL(12,2) := 0;
    v_coupon RECORD;
BEGIN
    -- 1. Security Check
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized checkout attempt';
    END IF;

    -- 2. Validate Payment Method
    IF p_payment_method NOT IN ('cod', 'wallet', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method';
    END IF;
    
    -- 3. Check for idempotency key to prevent duplicate orders
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RAISE EXCEPTION 'Idempotency conflict: order already processed';
        END IF;
    END IF;

    -- 4. Calculate Subtotal
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item.productid;
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
        
        -- Cold chain check bypassed for now as category_id is UUID
        v_is_cold_chain := FALSE;
    END LOOP;

    -- Authoritative Coupon Validation
    IF p_coupon_code IS NOT NULL AND p_coupon_code != '' THEN
        SELECT * INTO v_coupon FROM public.coupons WHERE code = p_coupon_code AND active = true;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid coupon code: %', p_coupon_code;
        END IF;
        
        IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
            RAISE EXCEPTION 'Coupon code % has expired', p_coupon_code;
        END IF;
        
        IF v_subtotal < v_coupon.min_order_value THEN
            RAISE EXCEPTION 'Order subtotal does not meet minimum value for coupon %', p_coupon_code;
        END IF;
        
        -- Calculate the discount
        IF v_coupon.discount_type = 'percentage' THEN
            v_real_discount_val := v_subtotal * (v_coupon.discount_value / 100);
            IF v_coupon.max_discount IS NOT NULL AND v_real_discount_val > v_coupon.max_discount THEN
                v_real_discount_val := v_coupon.max_discount;
            END IF;
        ELSIF v_coupon.discount_type = 'flat' THEN
            v_real_discount_val := v_coupon.discount_value;
        END IF;
        
        IF v_real_discount_val > v_subtotal THEN
            v_real_discount_val := v_subtotal;
        END IF;
    END IF;
    
    v_total_amount := GREATEST(0, v_subtotal - v_real_discount_val + p_delivery_fee);
    
    -- 5. Find an eligible warehouse that can fulfill the ENTIRE order
    FOR v_warehouse IN SELECT id FROM public.warehouses
    LOOP
        v_warehouse_id := v_warehouse.id;
        v_can_fulfill := TRUE;
        
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
        LOOP
            IF get_sellable_quantity(v_warehouse_id, v_item.productid) < v_item.quantity THEN
                v_can_fulfill := FALSE;
                EXIT;
            END IF;
        END LOOP;
        
        IF v_can_fulfill = TRUE THEN
            EXIT;
        END IF;
    END LOOP;
    
    IF v_can_fulfill = FALSE OR v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No active warehouse can fulfill this order due to insufficient stock';
    END IF;

    -- 6. Process Wallet Payment
    IF p_payment_method = 'wallet' THEN
        -- Lock profile
        SELECT wallet_balance INTO v_wallet_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
        
        IF v_wallet_balance < v_total_amount THEN
            RAISE EXCEPTION 'Insufficient wallet balance';
        END IF;
        
        -- Deduct
        UPDATE public.profiles SET wallet_balance = wallet_balance - v_total_amount WHERE id = p_user_id;
        
        -- Create wallet transaction
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (p_user_id, v_total_amount, 'debit', 'Order Checkout');
        
        v_final_payment_status := 'paid';
    END IF;

    -- 7. Create Order
    INSERT INTO public.orders (
        customer_id, 
        warehouse_id,
        status, 
        total_amount, 
        discount_amount, 
        coupon_code, 
        delivery_fee, 
        delivery_address, 
        delivery_lat, 
        delivery_lng, 
        otp_code, 
        delivery_speed, 
        is_cold_chain, 
        payment_method, 
        payment_status,
        cod_collected
    )
    VALUES (
        p_user_id, 
        v_warehouse_id,
        'placed', 
        v_total_amount, 
        v_real_discount_val, 
        p_coupon_code, 
        p_delivery_fee, 
        p_address, 
        p_lat, 
        p_lng, 
        FLOOR(RANDOM() * (999999 - 100000 + 1) + 100000)::TEXT, 
        p_delivery_speed, 
        v_is_cold_chain, 
        p_payment_method, 
        v_final_payment_status,
        FALSE
    ) RETURNING id INTO v_order_id;

    -- 8. Create Order Items and Reservations
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        
        INSERT INTO public.order_items (
            order_id, 
            product_id, 
            quantity, 
            price, 
            picked_quantity, 
            status
        ) VALUES (
            v_order_id, 
            v_item.productid, 
            v_item.quantity, 
            v_item_price, 
            0, 
            'pending'
        );
        
        -- Create physical inventory reservation (this triggers global stock sync)
        INSERT INTO public.inventory_reservations (
            order_id, 
            warehouse_id, 
            product_id, 
            quantity, 
            status
        ) VALUES (
            v_order_id,
            v_warehouse_id,
            v_item.productid,
            v_item.quantity,
            'reserved'
        );
    END LOOP;

    -- 9. Create Payment Transaction
    INSERT INTO public.payment_transactions (
        order_id, 
        user_id, 
        amount, 
        payment_method, 
        status, 
        idempotency_key
    ) VALUES (
        v_order_id, 
        p_user_id, 
        v_total_amount, 
        p_payment_method, 
        v_final_payment_status, 
        p_idempotency_key
    );
    
    -- 10. Loyalty Points
    IF p_payment_method IN ('cod', 'wallet') THEN
        UPDATE public.profiles 
        SET loyalty_points = loyalty_points + FLOOR(v_total_amount / 2) 
        WHERE id = p_user_id;
    END IF;

    RETURN v_order_id;
END;
$$;
