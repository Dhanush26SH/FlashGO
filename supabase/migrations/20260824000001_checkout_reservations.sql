-- Phase 17.2: Checkout Reservations & Reconciled Picking

-- 1. Modify process_checkout to use get_sellable_quantity and reservations
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
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId UUID, quantity INT)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.productId;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_item.productId;
        END IF;
        
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
        
        -- Cold chain check bypassed for now as category_id is UUID
        v_is_cold_chain := FALSE;
    END LOOP;

    IF p_discount_val > v_subtotal THEN
        RAISE EXCEPTION 'Discount cannot exceed subtotal';
    END IF;
    
    v_total_amount := GREATEST(0, v_subtotal - p_discount_val + p_delivery_fee);
    
    -- 5. Find an eligible warehouse that can fulfill the ENTIRE order
    FOR v_warehouse IN SELECT id FROM public.warehouses WHERE active = true
    LOOP
        v_warehouse_id := v_warehouse.id;
        v_can_fulfill := TRUE;
        
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(productId UUID, quantity INT)
        LOOP
            -- Validate sellable quantity explicitly locking via FOR UPDATE implicitly happens if we lock the aggregate, but get_sellable_quantity is a read. 
            -- We rely on the reservation insert to prevent overselling logically or rely on aggregate lock.
            IF get_sellable_quantity(v_warehouse_id, v_item.productId) < v_item.quantity THEN
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

    -- 8. Create Order Items and Reservations
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
            v_item.productId,
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


-- 2. Modify pick_fefo_item to consume reservations
CREATE OR REPLACE FUNCTION pick_fefo_item(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_remaining_qty INTEGER := p_quantity;
    v_batch RECORD;
    v_take_qty INTEGER;
    v_consumed_batches JSONB := '[]'::JSONB;
    v_total_stock INTEGER;
    v_is_suspended BOOLEAN;
    v_reserved_qty INTEGER;
BEGIN
    -- 1. Validate permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_user_id AND role IN ('picker', 'admin', 'warehouse_staff')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User % is not a valid picker/admin', p_user_id;
    END IF;

    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_user_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account % is suspended. Cannot perform picking operations.', p_user_id;
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- 2. Verify and lock total stock first to prevent concurrent aggregate modification deadlocks
    SELECT quantity INTO v_total_stock 
    FROM public.warehouse_stock 
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id FOR UPDATE;

    IF v_total_stock IS NULL OR v_total_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient total stock in warehouse % for product %', p_warehouse_id, p_product_id;
    END IF;

    -- 3. Lock and iterate through active batches using FEFO
    FOR v_batch IN 
        SELECT id, batch_number, expiry_date, available_quantity 
        FROM public.product_batches
        WHERE warehouse_id = p_warehouse_id 
          AND product_id = p_product_id 
          AND status = 'active'
          AND available_quantity > 0
          AND expiry_date >= CURRENT_DATE
        ORDER BY expiry_date ASC, created_at ASC, id ASC
        FOR UPDATE
    LOOP
        IF v_remaining_qty <= 0 THEN
            EXIT; -- We have fulfilled the pick
        END IF;

        -- Calculate how much to take from this batch
        IF v_batch.available_quantity >= v_remaining_qty THEN
            v_take_qty := v_remaining_qty;
        ELSE
            v_take_qty := v_batch.available_quantity;
        END IF;

        -- Consume from batch
        UPDATE public.product_batches
        SET available_quantity = available_quantity - v_take_qty,
            status = CASE WHEN available_quantity - v_take_qty = 0 THEN 'depleted' ELSE 'active' END
        WHERE id = v_batch.id;

        -- Record ledger (ADDED order_id)
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id, order_id)
        VALUES (p_warehouse_id, p_product_id, -v_take_qty, 'picking', p_user_id, v_batch.id, p_order_id);

        -- Add to return value
        v_consumed_batches := v_consumed_batches || jsonb_build_object(
            'batch_id', v_batch.id,
            'batch_number', v_batch.batch_number,
            'quantity_consumed', v_take_qty,
            'expiry_date', v_batch.expiry_date
        );

        v_remaining_qty := v_remaining_qty - v_take_qty;
    END LOOP;

    IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Insufficient active/unexpired batch stock. Need % more units.', v_remaining_qty;
    END IF;

    -- 4. Update aggregate warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    -- 5. Mark reservation as consumed
    UPDATE public.inventory_reservations
    SET quantity = quantity - p_quantity,
        status = CASE WHEN quantity - p_quantity <= 0 THEN 'consumed' ELSE 'reserved' END,
        updated_at = now()
    WHERE order_id = p_order_id AND product_id = p_product_id AND status = 'reserved';

    RETURN v_consumed_batches;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Modify undo_fefo_pick to restore reservations
CREATE OR REPLACE FUNCTION undo_fefo_pick(
    p_order_id UUID,
    p_product_id UUID,
    p_picker_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_ledger RECORD;
    v_warehouse_id UUID;
    v_total_restored INTEGER := 0;
BEGIN
    -- 1. Validate permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_picker_id AND role IN ('picker', 'admin', 'warehouse_staff')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User % is not a valid picker/admin', p_picker_id;
    END IF;

    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_picker_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account % is suspended.', p_picker_id;
    END IF;

    -- 2. Validate Order state and ownership
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to this order';
    END IF;

    IF v_order.status IN ('packed', 'out_for_delivery', 'delivered') THEN
        RAISE EXCEPTION 'Cannot undo pick for an order in status: %', v_order.status;
    END IF;

    v_warehouse_id := v_order.warehouse_id;

    -- Lock warehouse stock aggregate
    PERFORM 1 FROM public.warehouse_stock WHERE warehouse_id = v_warehouse_id AND product_id = p_product_id FOR UPDATE;

    -- 3. Find and Reverse ledger entries
    FOR v_ledger IN
        SELECT batch_id, SUM(quantity_change) as net_picked
        FROM public.stock_ledgers
        WHERE order_id = p_order_id 
          AND product_id = p_product_id 
          AND reason IN ('picking', 'picking_undo')
        GROUP BY batch_id
        HAVING SUM(quantity_change) < 0
    LOOP
        -- The net_picked is negative (e.g. -5). We need to restore ABS(net_picked).
        DECLARE
            v_restore_qty INTEGER := ABS(v_ledger.net_picked);
        BEGIN
            -- Update product_batches (Lock row for update)
            PERFORM 1 FROM public.product_batches WHERE id = v_ledger.batch_id FOR UPDATE;

            UPDATE public.product_batches
            SET available_quantity = available_quantity + v_restore_qty,
                status = 'active'
            WHERE id = v_ledger.batch_id;

            -- Record compensating ledger
            INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id, order_id)
            VALUES (v_warehouse_id, p_product_id, v_restore_qty, 'picking_undo', p_picker_id, v_ledger.batch_id, p_order_id);

            v_total_restored := v_total_restored + v_restore_qty;
        END;
    END LOOP;

    IF v_total_restored = 0 THEN
        RETURN; -- idempotent
    END IF;

    -- 4. Restore aggregate warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity + v_total_restored
    WHERE warehouse_id = v_warehouse_id AND product_id = p_product_id;

    -- 5. Restore reservation
    UPDATE public.inventory_reservations
    SET quantity = quantity + v_total_restored,
        status = 'reserved',
        updated_at = now()
    WHERE order_id = p_order_id AND product_id = p_product_id AND (status = 'reserved' OR status = 'consumed');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Create function to release reservations on cancellation
CREATE OR REPLACE FUNCTION release_order_reservations(p_order_id UUID) RETURNS void AS $$
BEGIN
    UPDATE public.inventory_reservations
    SET status = 'released', updated_at = now()
    WHERE order_id = p_order_id AND status = 'reserved';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger_order_cancellation to call release_order_reservations
CREATE OR REPLACE FUNCTION process_order_cancellation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        -- Only allow cancellation before picking
        IF OLD.status IN ('picking', 'packed', 'out_for_delivery', 'delivered') THEN
            RAISE EXCEPTION 'Cannot cancel an order that has already started fulfillment.';
        END IF;
        
        -- Release inventory reservations
        PERFORM release_order_reservations(NEW.id);
        
        -- Reverse payment if paid
        IF OLD.payment_status = 'paid' THEN
            NEW.payment_status := 'refunded';
            IF OLD.payment_method = 'wallet' THEN
                UPDATE public.profiles SET wallet_balance = wallet_balance + OLD.total_amount WHERE id = OLD.customer_id;
                INSERT INTO public.wallet_transactions (user_id, amount, type, description)
                VALUES (OLD.customer_id, OLD.total_amount, 'credit', 'Refund for Order ' || OLD.id);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
