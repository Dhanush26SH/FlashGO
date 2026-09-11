-- Phase 17: Packing Integrity Migration

-- 1. Create pack_order RPC
CREATE OR REPLACE FUNCTION pack_order(
    p_order_id UUID,
    p_picker_id UUID,
    p_bag_number TEXT
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_item RECORD;
    v_picked_qty INTEGER;
    v_sub_picked_qty INTEGER;
BEGIN
    -- 1. Validate picker
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_picker_id AND role IN ('picker', 'admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User is not a valid picker/admin';
    END IF;

    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_picker_id;

    IF v_is_suspended THEN
        RAISE EXCEPTION 'Picker account is suspended.';
    END IF;

    -- 2. Lock and validate order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Order is not assigned to this picker';
    END IF;

    IF v_order.status = 'packed' THEN
        RETURN; -- Idempotent
    END IF;

    IF v_order.status != 'picking' THEN
        RAISE EXCEPTION 'Order is not in picking state (status: %)', v_order.status;
    END IF;

    -- validate bag number
    IF TRIM(COALESCE(p_bag_number, '')) = '' THEN
        RAISE EXCEPTION 'Bag number is mandatory to pack an order';
    END IF;

    -- 3. Check items completion
    FOR v_item IN 
        SELECT id, product_id, quantity, status
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        -- Check how much was picked for this original product
        SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_picked_qty
        FROM public.stock_ledgers
        WHERE order_id = p_order_id 
          AND product_id = v_item.product_id 
          AND reason IN ('picking', 'picking_undo');

        IF v_picked_qty < v_item.quantity THEN
            -- Find how much of the unfulfilled part was fulfilled by an approved substitute
            SELECT ABS(COALESCE(SUM(sl.quantity_change), 0)) INTO v_sub_picked_qty
            FROM public.order_substitutions os
            JOIN public.stock_ledgers sl ON sl.order_id = os.order_id AND sl.product_id = os.suggested_product_id
            WHERE os.order_id = p_order_id
              AND os.original_item_id = v_item.product_id
              AND os.status = 'approved'
              AND sl.reason IN ('picking', 'picking_undo');

            IF (v_picked_qty + v_sub_picked_qty) < v_item.quantity THEN
                -- If it's short, the ONLY way it's valid is if it's explicitly marked out_of_stock
                IF v_item.status != 'out_of_stock' THEN
                    RAISE EXCEPTION 'Order item % is not fully picked and not marked out_of_stock', v_item.product_id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- 4. Transition to packed
    UPDATE public.orders 
    SET status = 'packed', 
        bag_number = TRIM(p_bag_number),
        updated_at = now()
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Modify pick_fefo_item to prevent over-picking
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
    v_allowed_qty INTEGER := 0;
    v_already_picked INTEGER := 0;
    v_sub_record RECORD;
    v_orig_picked INTEGER;
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

    -- Prevent over-picking inconsistencies
    -- Calculate how much is needed for this product as an original item
    SELECT COALESCE(SUM(quantity), 0) INTO v_allowed_qty
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id = p_product_id;

    -- Add how much is needed as an approved substitution
    FOR v_sub_record IN 
        SELECT os.original_item_id, oi.quantity as orig_qty
        FROM public.order_substitutions os
        JOIN public.order_items oi ON oi.order_id = os.order_id AND oi.product_id = os.original_item_id
        WHERE os.order_id = p_order_id AND os.suggested_product_id = p_product_id AND os.status = 'approved'
    LOOP
        -- find how much of the original was already picked
        SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_orig_picked
        FROM public.stock_ledgers
        WHERE order_id = p_order_id AND product_id = v_sub_record.original_item_id AND reason IN ('picking', 'picking_undo');
        
        v_allowed_qty := v_allowed_qty + GREATEST(0, v_sub_record.orig_qty - v_orig_picked);
    END LOOP;

    -- Calculate how much has already been picked of THIS product
    SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_already_picked
    FROM public.stock_ledgers
    WHERE order_id = p_order_id AND product_id = p_product_id AND reason IN ('picking', 'picking_undo');

    IF p_quantity > (v_allowed_qty - v_already_picked) THEN
        RAISE EXCEPTION 'Cannot over-pick product %. Allowed remaining: %', p_product_id, GREATEST(0, v_allowed_qty - v_already_picked);
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

        -- Record ledger
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
