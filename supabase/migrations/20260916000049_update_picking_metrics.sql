-- 20260916000049_update_picking_metrics.sql

CREATE OR REPLACE FUNCTION public.pick_fefo_item(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
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

    -- Ensure the picker is actually assigned to the order
    IF NOT EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = p_order_id AND (picker_id = p_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin'))
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to this order';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- NEW: Ensure we do not pick more than reserved for this order item
    SELECT quantity INTO v_reserved_qty
    FROM public.inventory_reservations
    WHERE order_id = p_order_id AND product_id = p_product_id AND status = 'reserved' FOR UPDATE;

    IF v_reserved_qty IS NULL THEN
        RAISE EXCEPTION 'No active reservation found for this product in the order.';
    END IF;

    IF p_quantity > v_reserved_qty THEN
        RAISE EXCEPTION 'Cannot pick % units. Only % units are reserved/remaining to pick.', p_quantity, v_reserved_qty;
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

    -- 6. Mark order item as picked
    UPDATE public.order_items
    SET picked_quantity = COALESCE(picked_quantity, 0) + p_quantity,
        status = CASE WHEN COALESCE(picked_quantity, 0) + p_quantity >= quantity THEN 'picked' ELSE status END
    WHERE order_id = p_order_id AND product_id = p_product_id;

    -- 7. Update Picker items_picked metric securely
    UPDATE public.staff_shifts
    SET items_picked = items_picked + p_quantity,
        updated_at = now()
    WHERE staff_id = p_user_id AND status = 'active';

    RETURN v_consumed_batches;
END;
$$ LANGUAGE plpgsql;
