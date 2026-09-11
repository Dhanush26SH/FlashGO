-- Migration: 20260819000002_external_payment_rpc.sql

-- 1. Modify process_checkout to support upi and card
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
    v_warehouse_id UUID;
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

    -- 4. Calculate Authoritative Total & Validate Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productId FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item.productId;
        END IF;
        
        IF v_product.stock_quantity < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_product.name;
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
        
        IF v_product.category_id IN ('c2', 'c4') THEN
            v_is_cold_chain := TRUE;
        END IF;
    END LOOP;

    IF p_discount_val > v_subtotal THEN
        RAISE EXCEPTION 'Discount cannot exceed subtotal';
    END IF;
    
    v_total_amount := GREATEST(0, v_subtotal - p_discount_val + p_delivery_fee);
    
    SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;

    -- 5. Process Wallet Payment
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

    -- 6. Create Order
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

    -- 7. Create Order Items and Deduct Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productId;
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
            v_item.productId, 
            v_item.quantity, 
            v_item_price, 
            0, 
            'pending'
        );
        
        -- Deduct stock_quantity from products
        UPDATE public.products 
        SET stock_quantity = stock_quantity - v_item.quantity 
        WHERE id = v_item.productId;
    END LOOP;

    -- 8. Create Payment Transaction
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
    
    -- 9. Loyalty Points (1 point for every 2 spent)
    -- Preserve existing behavior for cod and wallet (granted at checkout)
    IF p_payment_method IN ('cod', 'wallet') THEN
        UPDATE public.profiles 
        SET loyalty_points = loyalty_points + FLOOR(v_total_amount / 2) 
        WHERE id = p_user_id;
    END IF;

    RETURN v_order_id;
END;
$$;


-- 2. Create resolve_external_payment RPC
CREATE OR REPLACE FUNCTION public.resolve_external_payment(
    p_order_id UUID,
    p_transaction_id TEXT,
    p_amount DECIMAL,
    p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_payment_transaction_id UUID;
BEGIN
    -- 1. Locate and lock the order using FOR UPDATE
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- 2. Confirm the order is awaiting external payment
    IF v_order.payment_status != 'pending' THEN
        RAISE EXCEPTION 'Order is not in pending payment state. Current state: %', v_order.payment_status;
    END IF;

    -- 3. Confirm the payment method is upi or card
    IF v_order.payment_method NOT IN ('upi', 'card') THEN
        RAISE EXCEPTION 'Order payment method (%) does not support external resolution', v_order.payment_method;
    END IF;

    -- 4. Validate the server-side order/payment amount
    IF p_amount != v_order.total_amount THEN
        RAISE EXCEPTION 'Payment amount mismatch. Expected: %, Received: %', v_order.total_amount, p_amount;
    END IF;

    -- 5. Enforce idempotency using the existing payment transaction idempotency architecture
    -- Return silently if duplicate to ignore
    IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key) THEN
        RETURN NULL;
    END IF;

    -- 6. Record the external payment transaction
    INSERT INTO public.payment_transactions (
        order_id,
        user_id,
        amount,
        payment_method,
        status,
        transaction_id,
        idempotency_key
    ) VALUES (
        p_order_id,
        v_order.customer_id,
        p_amount,
        v_order.payment_method,
        'paid',
        p_transaction_id,
        p_idempotency_key
    ) RETURNING id INTO v_payment_transaction_id;

    -- 7. Change the order payment status from pending to paid
    UPDATE public.orders 
    SET payment_status = 'paid', updated_at = now()
    WHERE id = p_order_id;

    -- 8. Perform any payment-success actions
    -- Reward loyalty points that were deferred at checkout
    UPDATE public.profiles 
    SET loyalty_points = loyalty_points + FLOOR(p_amount / 2) 
    WHERE id = v_order.customer_id;

    RETURN v_payment_transaction_id;
END;
$$;
