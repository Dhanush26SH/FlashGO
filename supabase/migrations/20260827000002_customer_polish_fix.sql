-- Migration: Secure Coupons & Backend Search

-- 1. Extend get_warehouse_catalog with search parameter
CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(
    p_warehouse_id UUID,
    p_search_query TEXT DEFAULT NULL
) RETURNS TABLE(
    id UUID,
    category_id UUID,
    name TEXT,
    description TEXT,
    price NUMERIC,
    discount_price NUMERIC,
    image_url TEXT,
    sellable_quantity INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.discount_price,
        p.image_url,
        get_sellable_quantity(p_warehouse_id, p.id) AS sellable_quantity
    FROM public.products p
    WHERE p.is_active = true
      AND (p_search_query IS NULL OR p.name ILIKE '%' || p_search_query || '%');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2. Secure process_checkout by authoritative coupon validation
DROP FUNCTION IF EXISTS public.process_checkout(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT);

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
    v_item RECORD;
    v_product RECORD;
    v_subtotal NUMERIC := 0;
    v_total_amount NUMERIC := 0;
    v_item_price NUMERIC;
    v_warehouse_id UUID;
    v_is_cold_chain BOOLEAN;
    v_wallet_balance NUMERIC;
    v_final_payment_status TEXT := 'unpaid';
    v_real_discount_val NUMERIC := 0;
    v_coupon RECORD;
BEGIN
    -- 1. Calculate subtotal securely from DB
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found or inactive', v_item.productid;
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
        v_is_cold_chain := FALSE; -- Simplification
    END LOOP;

    -- 2. Authoritative Coupon Validation
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
    
    -- 3. Final Total Calculation
    v_total_amount := GREATEST(0, v_subtotal - v_real_discount_val + p_delivery_fee);
    
    -- 4. ROUTING CONTRACT: Resolve authoritative warehouse for this address
    v_warehouse_id := get_serving_warehouse(p_lat, p_lng);
    
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No active warehouse services this location';
    END IF;
    
    -- 5. Validate stock strictly against the resolved warehouse
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        IF get_sellable_quantity(v_warehouse_id, v_item.productid) < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product % at serving warehouse', v_item.productid;
        END IF;
    END LOOP;

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
        warehouse_id,
        status, 
        total_amount, 
        discount_amount, 
        coupon_code, 
        delivery_fee, 
        delivery_address, 
        delivery_lat, 
        delivery_lng,
        otp_code
    ) VALUES (
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
        floor(random() * 900000 + 100000)::text -- Gen OTP
    ) RETURNING id INTO v_order_id;

    -- 8. Insert Order Items and Update Inventory
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        
        INSERT INTO public.order_items (order_id, product_id, quantity, price)
        VALUES (v_order_id, v_item.productid, v_item.quantity, v_item_price);
        
        UPDATE public.warehouse_stock
        SET reserved_quantity = reserved_quantity + v_item.quantity
        WHERE warehouse_id = v_warehouse_id AND product_id = v_item.productid;
    END LOOP;

    -- 9. Loyalty Points (1 point for every 2 spent)
    UPDATE public.profiles
    SET loyalty_points = loyalty_points + FLOOR(v_total_amount / 2) 
    WHERE id = p_user_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
