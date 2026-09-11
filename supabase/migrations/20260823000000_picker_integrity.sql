-- Phase 17: Picker Integrity Migration

-- 1. Upgrade stock_ledgers
ALTER TABLE public.stock_ledgers ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_ledgers_reversal ON public.stock_ledgers(order_id, product_id, batch_id);

-- 2. Update pick_fefo_item to insert order_id
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

    -- 4. Check if we fulfilled the request
    IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Insufficient active/unexpired batch stock. Need % more units.', v_remaining_qty;
    END IF;

    -- 5. Update aggregate warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    RETURN v_consumed_batches;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Implement start_picking
CREATE OR REPLACE FUNCTION start_picking(p_order_id UUID, p_picker_id UUID) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_picker_warehouse_id UUID;
BEGIN
    -- Validate profile and role
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_picker_warehouse_id, v_is_suspended 
    FROM public.profiles 
    WHERE id = p_picker_id AND role IN ('picker', 'admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: User is not a valid picker/admin';
    END IF;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account is suspended.';
    END IF;

    -- Lock and get order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Check assignment (admin bypass allowed for flexibility)
    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Order is not assigned to this picker';
    END IF;

    -- Idempotency
    IF v_order.status = 'picking' THEN
        RETURN;
    END IF;

    -- Validate state transition
    IF v_order.status != 'placed' THEN
        RAISE EXCEPTION 'Cannot start picking for order in status: %', v_order.status;
    END IF;

    -- Validate warehouse match (allow admin to bypass if needed, but normally strict)
    IF v_order.warehouse_id != v_picker_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Warehouse mismatch between picker and order';
    END IF;

    -- Transition state
    UPDATE public.orders SET status = 'picking', updated_at = now() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Implement undo_fefo_pick
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

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
