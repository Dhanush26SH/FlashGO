-- 20260826000004_unified_routing.sql

-- 1. Ensure warehouses have an is_active flag
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Create the authoritative warehouse resolver
CREATE OR REPLACE FUNCTION public.get_serving_warehouse(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS UUID AS $$
DECLARE
    v_warehouse_id UUID;
BEGIN
    -- Simple Euclidean distance resolver for non-PostGIS setup
    -- Distance = sqrt((lat2 - lat1)^2 + (lng2 - lng1)^2)
    -- In a real production setup with PostGIS, we would use ST_Distance
    
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE is_active = true
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY (POWER(lat - p_lat, 2) + POWER(lng - p_lng, 2)) ASC
    LIMIT 1;
    
    RETURN v_warehouse_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Create the secure read-only catalog RPC for the frontend
CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(
    p_warehouse_id UUID
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
    WHERE p.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 4. Rewrite process_checkout to use the unified routing contract
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_user_id UUID,
    p_address TEXT,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_items JSONB, -- Array of { productid: UUID, quantity: INT }
    p_discount_val NUMERIC,
    p_coupon_code TEXT,
    p_delivery_fee NUMERIC,
    p_delivery_speed TEXT,
    p_payment_method TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_total_amount NUMERIC;
    v_subtotal NUMERIC := 0;
    v_item RECORD;
    v_product RECORD;
    v_item_price NUMERIC;
    v_wallet_balance NUMERIC;
    v_final_payment_status TEXT := 'unpaid';
    v_is_cold_chain BOOLEAN := FALSE;
    
    v_warehouse_id UUID;
BEGIN
    -- Security Check
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized checkout attempt';
    END IF;

    -- Validate Payment Method
    IF p_payment_method NOT IN ('cod', 'wallet', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method';
    END IF;
    
    -- Check for idempotency key
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RAISE EXCEPTION 'Idempotency conflict: order already processed';
        END IF;
    END IF;

    -- Calculate Subtotal
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item.productid;
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
        v_is_cold_chain := FALSE;
    END LOOP;

    IF p_discount_val > v_subtotal THEN
        RAISE EXCEPTION 'Discount cannot exceed subtotal';
    END IF;
    
    v_total_amount := GREATEST(0, v_subtotal - p_discount_val + p_delivery_fee);
    
    -- ROUTING CONTRACT: Resolve authoritative warehouse for this address
    v_warehouse_id := get_serving_warehouse(p_lat, p_lng);
    
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No active warehouse services this location';
    END IF;
    
    -- Validate stock strictly against the resolved warehouse
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        IF get_sellable_quantity(v_warehouse_id, v_item.productid) < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product % at serving warehouse', v_item.productid;
        END IF;
    END LOOP;

    -- Process Wallet Payment
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

    -- Create Order
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
        p_discount_val, 
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

    -- Create Order Items and Reservations
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productid UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productid;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        
        -- Insert Order Item
        INSERT INTO public.order_items (order_id, product_id, quantity, price_at_time)
        VALUES (v_order_id, v_item.productid, v_item.quantity, v_item_price);
        
        -- Create Inventory Reservation
        INSERT INTO public.inventory_reservations (
            warehouse_id, product_id, order_id, quantity_reserved
        ) VALUES (
            v_warehouse_id,
            v_item.productid,
            v_item.quantity
        );
    END LOOP;

    -- Record Payment Transaction if wallet
    IF p_payment_method = 'wallet' THEN
        INSERT INTO public.payment_transactions (
            order_id, amount, payment_method, payment_status, transaction_reference, idempotency_key
        ) VALUES (
            v_order_id, v_total_amount, p_payment_method, 'success', 'WALLET-' || v_order_id, p_idempotency_key
        );
    ELSIF p_payment_method IN ('upi', 'card') THEN
        INSERT INTO public.payment_transactions (
            order_id, amount, payment_method, payment_status, idempotency_key
        ) VALUES (
            v_order_id, v_total_amount, p_payment_method, 'pending', p_idempotency_key
        );
    END IF;

    -- Loyalty Points
    IF v_final_payment_status = 'paid' THEN
        UPDATE public.profiles 
        SET loyalty_points = loyalty_points + FLOOR(v_total_amount / 2) 
        WHERE id = p_user_id;
    END IF;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;
