-- Migration: 20260922000012_remove_expired_batch_inventory.sql
-- Description: RPC for safely removing expired inventory by Warehouse Staff (damage_expiry duty)

CREATE OR REPLACE FUNCTION public.remove_expired_batch_inventory(
    p_location_id UUID,
    p_batch_id UUID,
    p_removed_qty INTEGER,
    p_scanned_barcode TEXT,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_shift RECORD;
    v_batch RECORD;
    v_product RECORD;
    v_placement RECORD;
    v_warehouse_id UUID;
BEGIN
    IF p_removed_qty <= 0 THEN
        RAISE EXCEPTION 'Removed quantity must be greater than zero.';
    END IF;

    -- 1. Validate Authenticated Staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id AND is_suspended = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or suspended.';
    END IF;
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Only warehouse staff can perform expiry duties.';
    END IF;
    v_warehouse_id := v_profile.warehouse_id;

    -- 2. Validate Active Shift and Duty
    SELECT * INTO v_shift FROM public.staff_shifts 
    WHERE staff_id = p_user_id AND status = 'active' AND current_duty = 'damage_expiry';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: You must have an active shift with Expiry (damage_expiry) duty.';
    END IF;

    -- 3. Validate Batch
    SELECT * INTO v_batch FROM public.product_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found.';
    END IF;
    IF v_batch.warehouse_id != v_warehouse_id THEN
        RAISE EXCEPTION 'Batch does not belong to your warehouse.';
    END IF;
    IF v_batch.status = 'depleted' THEN
        RAISE EXCEPTION 'Batch is already depleted.';
    END IF;
    IF v_batch.expiry_date >= CURRENT_DATE THEN
        RAISE EXCEPTION 'Batch is not expired yet. Only expired batches can be removed via this workflow.';
    END IF;

    -- 4. Validate Product and Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_batch.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    IF v_product.internal_barcode != p_scanned_barcode AND v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'Barcode mismatch: Scanned barcode does not match the product.';
    END IF;

    -- 5. Validate and decrement Placement (Current Architecture)
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id AND warehouse_id = v_warehouse_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is not located at this placement.';
    END IF;
    IF v_placement.quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than physically exists at this location (found: %, requested: %).', v_placement.quantity, p_removed_qty;
    END IF;

    IF v_batch.available_quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than available in the batch (available: %, requested: %).', v_batch.available_quantity, p_removed_qty;
    END IF;

    -- 6. Perform the removals
    -- Decrement Placement
    UPDATE public.warehouse_product_placements 
    SET quantity = quantity - p_removed_qty 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id;

    -- Decrement Batch
    UPDATE public.product_batches 
    SET available_quantity = available_quantity - p_removed_qty,
        status = CASE WHEN available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE status END
    WHERE id = p_batch_id;

    -- Decrement global warehouse stock
    PERFORM 1 FROM public.warehouse_stock WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id FOR UPDATE;
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_removed_qty
    WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id;

    -- 7. Ledger Movement
    INSERT INTO public.stock_ledgers (
        warehouse_id, 
        product_id, 
        batch_id, 
        quantity_change, 
        reason, 
        performed_by
    ) VALUES (
        v_warehouse_id, 
        v_batch.product_id, 
        p_batch_id, 
        -(p_removed_qty), 
        'expired', 
        p_user_id
    );

    RETURN jsonb_build_object(
        'success', true, 
        'removed_quantity', p_removed_qty, 
        'remaining_batch_quantity', v_batch.available_quantity - p_removed_qty,
        'batch_status', CASE WHEN v_batch.available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE v_batch.status END
    );
END;
$$;
