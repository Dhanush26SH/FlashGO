-- Migration 20260903000003_fix_picker_completion.sql

CREATE OR REPLACE FUNCTION complete_picking(
    p_order_id UUID,
    p_picker_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_picked_qty INTEGER;
    v_sub_picked_qty INTEGER;
    v_is_suspended BOOLEAN;
    v_valid_role BOOLEAN;
BEGIN
    SELECT COALESCE(is_suspended, FALSE), role IN ('picker', 'admin', 'warehouse_manager', 'warehouse_staff') 
    INTO v_is_suspended, v_valid_role
    FROM public.profiles WHERE id = p_picker_id;

    IF NOT v_valid_role THEN
        RAISE EXCEPTION 'Unauthorized: User is not a picker or staff';
    END IF;
    IF v_is_suspended THEN
        RAISE EXCEPTION 'Account is suspended.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'waiting_for_packing' THEN RETURN; END IF;
    IF v_order.status != 'picking' THEN
        RAISE EXCEPTION 'Order cannot be completed from status: %', v_order.status;
    END IF;
    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Wrong picker';
    END IF;

    -- Verify all items are picked
    FOR v_item IN 
        SELECT id, product_id, quantity, status
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_picked_qty
        FROM public.stock_ledgers
        WHERE order_id = p_order_id 
          AND product_id = v_item.product_id 
          AND reason IN ('picking', 'picking_undo');

        IF v_picked_qty < v_item.quantity THEN
            SELECT ABS(COALESCE(SUM(sl.quantity_change), 0)) INTO v_sub_picked_qty
            FROM public.order_substitutions os
            JOIN public.stock_ledgers sl ON sl.order_id = os.order_id AND sl.product_id = os.suggested_product_id
            WHERE os.order_id = p_order_id
              AND os.original_item_id = v_item.product_id
              AND os.status = 'approved'
              AND sl.reason IN ('picking', 'picking_undo');

            IF (v_picked_qty + v_sub_picked_qty) < v_item.quantity THEN
                IF v_item.status != 'out_of_stock' THEN
                    RAISE EXCEPTION 'Order item % is not fully picked and not marked out_of_stock', v_item.product_id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Ensure no pending substitutions
    IF EXISTS (
        SELECT 1 FROM public.order_substitutions 
        WHERE order_id = p_order_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Cannot complete picking: Unresolved substitutions exist.';
    END IF;

    UPDATE public.orders 
    SET status = 'waiting_for_packing', updated_at = now()
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
