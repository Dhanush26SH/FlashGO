-- Phase 17.2: OOS Reservation Release

CREATE OR REPLACE FUNCTION mark_item_oos(
    p_order_id UUID,
    p_product_id UUID,
    p_picker_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_is_suspended BOOLEAN;
    v_picked_qty INTEGER;
    v_sub_status TEXT;
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

    IF v_order.status != 'picking' THEN
        RAISE EXCEPTION 'Order is not in picking state (status: %)', v_order.status;
    END IF;

    IF v_order.warehouse_id != (SELECT warehouse_id FROM public.profiles WHERE id = p_picker_id) AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;

    -- 3. Lock and validate item
    SELECT * INTO v_item FROM public.order_items WHERE order_id = p_order_id AND product_id = p_product_id FOR UPDATE;
    IF v_item.id IS NULL THEN
        RAISE EXCEPTION 'Product % is not in this order', p_product_id;
    END IF;

    IF v_item.status = 'out_of_stock' THEN
        RETURN; -- Idempotent
    END IF;

    -- 4. Calculate net picked quantity
    SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_picked_qty
    FROM public.stock_ledgers
    WHERE order_id = p_order_id 
      AND product_id = p_product_id 
      AND reason IN ('picking', 'picking_undo');

    IF v_picked_qty >= v_item.quantity THEN
        RAISE EXCEPTION 'Item is already fully picked. Cannot mark OOS.';
    END IF;

    IF v_picked_qty > 0 THEN
        RAISE EXCEPTION 'Item is partially picked. Undo picks before marking OOS.';
    END IF;

    -- 5. Check substitutions
    SELECT status INTO v_sub_status
    FROM public.order_substitutions
    WHERE order_id = p_order_id AND original_item_id = p_product_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub_status IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Cannot mark OOS while there is an active/pending substitution';
    END IF;

    -- 6. Update status safely
    UPDATE public.order_items SET status = 'out_of_stock' WHERE id = v_item.id;
    
    -- 7. Release any outstanding physical reservations
    UPDATE public.inventory_reservations
    SET status = 'released', updated_at = now()
    WHERE order_id = p_order_id AND product_id = p_product_id AND status = 'reserved';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
