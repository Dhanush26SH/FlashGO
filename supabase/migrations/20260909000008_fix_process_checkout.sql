-- Fix process_checkout RPC to match actual table schemas
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_user_id uuid,
    p_address text,
    p_delivery_speed text,
    p_payment_method text,
    p_items jsonb,
    p_coupon_code text DEFAULT NULL::text,
    p_lat double precision DEFAULT NULL::double precision,
    p_lng double precision DEFAULT NULL::double precision,
    p_idempotency_key text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    v_warehouse_id UUID;
    v_real_discount_val DECIMAL(12,2) := 0;
    v_coupon RECORD;
    v_base_delivery_fee DECIMAL(12,2);
    v_free_delivery_threshold DECIMAL(12,2);
    v_real_delivery_fee DECIMAL(12,2) := 0;
BEGIN
    -- 1. Security Check
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized checkout attempt';
    END IF;

    -- 2. Validate Payment Method
    IF p_payment_method NOT IN ('cod', 'wallet', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method';
    END IF;
    
    -- 3. Idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RAISE EXCEPTION 'Idempotency conflict: order already processed';
        END IF;
    END IF;

    -- 4. Calculate Subtotal
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item."productId" AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is unavailable or deactivated', v_item."productId";
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
    END LOOP;

    -- Authoritative Coupon Validation
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
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
    
    -- Calculate Delivery Fee
    SELECT base_delivery_fee, free_delivery_threshold INTO v_base_delivery_fee, v_free_delivery_threshold 
    FROM public.platform_settings WHERE id = 1;

    IF v_base_delivery_fee IS NULL THEN
        v_base_delivery_fee := 2.99;
        v_free_delivery_threshold := 15.00;
    END IF;

    IF v_subtotal >= v_free_delivery_threshold THEN
        v_real_delivery_fee := 0;
    ELSE
        v_real_delivery_fee := v_base_delivery_fee;
    END IF;
    
    v_total_amount := GREATEST(0, v_subtotal - v_real_discount_val) + v_real_delivery_fee;
    
    -- 5. Authoritative Warehouse Resolution & Validation
    v_warehouse_id := public.get_serving_warehouse(p_lat, p_lng);
    
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Unserviceable location';
    END IF;
    
    -- Ensure the selected warehouse has enough stock for all items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" UUID, quantity INT)
    LOOP
        IF public.get_sellable_quantity(v_warehouse_id, v_item."productId") < v_item.quantity THEN
            RAISE EXCEPTION 'Out of stock';
        END IF;
    END LOOP;

    -- Flag authorized mutation
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    -- 6. Process Wallet Payment
    IF p_payment_method = 'wallet' THEN
        SELECT wallet_balance INTO v_wallet_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
        IF v_wallet_balance < v_total_amount THEN
            RAISE EXCEPTION 'Insufficient wallet balance';
        END IF;
        
        UPDATE public.profiles SET wallet_balance = wallet_balance - v_total_amount WHERE id = p_user_id;
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (p_user_id, v_total_amount, 'debit', 'Order Checkout');
        v_final_payment_status := 'paid';
    END IF;

    -- 7. Create Order
    INSERT INTO public.orders (
        customer_id, 
        total_amount, 
        discount_amount, 
        coupon_code, 
        delivery_fee, 
        delivery_address, 
        delivery_lat, 
        delivery_lng, 
        status,
        warehouse_id
    )
    VALUES (
        p_user_id, 
        v_total_amount, 
        v_real_discount_val, 
        p_coupon_code, 
        v_real_delivery_fee, 
        p_address, 
        p_lat, 
        p_lng, 
        'placed',
        v_warehouse_id
    )
    RETURNING id INTO v_order_id;
    
    -- Save external payment Tx if needed
    IF p_payment_method IN ('upi', 'card') THEN
        INSERT INTO public.payment_transactions (order_id, user_id, amount, payment_method, status, transaction_id, idempotency_key)
        VALUES (v_order_id, p_user_id, v_total_amount, p_payment_method, 'pending', 'ext_' || v_order_id, p_idempotency_key);
    END IF;

    -- 8. Add Order Items & Reserve Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x("productId" UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item."productId";
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        
        INSERT INTO public.order_items (order_id, product_id, quantity, price, status)
        VALUES (v_order_id, v_item."productId", v_item.quantity, v_item_price, 'pending');
        
        -- Create reservation tied strictly to the serving warehouse
        INSERT INTO public.inventory_reservations (warehouse_id, product_id, order_id, quantity, status)
        VALUES (v_warehouse_id, v_item."productId", v_order_id, v_item.quantity, 'reserved');
    END LOOP;

    RETURN v_order_id;
END;
$function$;
