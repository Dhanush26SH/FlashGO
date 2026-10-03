-- Migration 20261003000004_fix_picker_bulk_confirm.sql
-- Description: Unifies pick_fefo_location_item to properly propagate p_quantity for bulk picking confirmations.

-- 1. Drop conflicting overloads
DROP FUNCTION IF EXISTS public.pick_fefo_location_item(UUID, UUID, UUID, INTEGER, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.pick_fefo_location_item(UUID, UUID, UUID, UUID, TEXT);

-- 2. Implement the unified, authoritative 7-argument version
CREATE OR REPLACE FUNCTION public.pick_fefo_location_item(
    p_warehouse_id UUID, 
    p_product_id UUID, 
    p_location_id UUID, 
    p_quantity INTEGER, 
    p_order_id UUID, 
    p_user_id UUID,
    p_scanned_barcode TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_placement RECORD;
    v_resolved_product_id UUID;
    v_order RECORD;
BEGIN
    -- Validations
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;
    
    -- Verify order state
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'picking' THEN RAISE EXCEPTION 'Order not in picking state'; END IF;
    IF v_order.warehouse_id != p_warehouse_id THEN RAISE EXCEPTION 'Order does not belong to this warehouse'; END IF;
    
    -- 1. Verify barcode matches expected product
    v_resolved_product_id := public.resolve_product_barcode(p_scanned_barcode);
    IF v_resolved_product_id IS NULL THEN
        RAISE EXCEPTION 'Barcode not recognized.';
    END IF;
    IF v_resolved_product_id != p_product_id THEN
        RAISE EXCEPTION 'Scanned barcode does not match the expected product.';
    END IF;

    -- 2. Physical Pick from location
    IF p_location_id IS NULL THEN
        RAISE EXCEPTION 'Cannot pick unplaced inventory. Valid location required.';
    END IF;

    -- Verify and lock placement
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = p_product_id AND warehouse_id = p_warehouse_id
    FOR UPDATE;

    IF v_placement IS NULL OR v_placement.quantity < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock in physical location.';
    END IF;

    -- Deduct from placement
    UPDATE public.warehouse_product_placements 
    SET quantity = quantity - p_quantity
    WHERE id = v_placement.id;

    -- Write history
    INSERT INTO public.warehouse_placement_events (warehouse_id, product_id, from_location_id, quantity, event_type, source, actor_id)
    VALUES (p_warehouse_id, p_product_id, p_location_id, p_quantity, 'pick', 'picker_app', p_user_id);

    -- 3. Call existing logic to handle warehouse_stock, batches, ledgers, items_picked, and order item status
    PERFORM public.pick_fefo_item(p_warehouse_id, p_product_id, p_quantity, p_order_id, p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$;
