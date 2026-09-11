-- Phase 19: Secure Batch Adjustments Migration

-- 1. Create the secure adjust_batch_stock RPC
CREATE OR REPLACE FUNCTION public.adjust_batch_stock(
    p_batch_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_suspended BOOLEAN;
    v_role TEXT;
    v_user_warehouse UUID;
    v_warehouse_id UUID;
    v_product_id UUID;
    v_batch_avail INTEGER;
    v_warehouse_qty INTEGER;
    v_reserved_qty INTEGER;
BEGIN
    -- 1. Validate caller identity and permissions
    SELECT role, warehouse_id, is_suspended 
    INTO v_role, v_user_warehouse, v_is_suspended
    FROM public.profiles 
    WHERE id = p_user_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Account is suspended';
    END IF;

    IF v_role NOT IN ('admin', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized: Only active admins or warehouse staff can adjust stock';
    END IF;

    -- 2. Validate reason constraint
    IF p_reason NOT IN ('damaged', 'expired', 'lost', 'correction') THEN
        RAISE EXCEPTION 'Invalid adjustment reason. Must be damaged, expired, lost, or correction.';
    END IF;

    -- 3. Lock batch and get details
    SELECT warehouse_id, product_id, available_quantity 
    INTO v_warehouse_id, v_product_id, v_batch_avail
    FROM public.product_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    -- 4. Authorize warehouse assignment for warehouse_staff
    IF v_role = 'warehouse_staff' AND v_user_warehouse != v_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot adjust stock in unassigned warehouses';
    END IF;

    -- 5. Lock warehouse stock
    SELECT quantity INTO v_warehouse_qty
    FROM public.warehouse_stock
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id
    FOR UPDATE;

    -- 6. Validate physical limits
    IF v_batch_avail + p_quantity_change < 0 THEN
        RAISE EXCEPTION 'Adjustment exceeds available batch quantity (Available: %, Requested: %)', v_batch_avail, ABS(p_quantity_change);
    END IF;

    IF v_warehouse_qty + p_quantity_change < 0 THEN
        RAISE EXCEPTION 'Adjustment exceeds aggregate warehouse quantity';
    END IF;

    -- 7. Validate reservation integrity (only if decrementing)
    IF p_quantity_change < 0 THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_qty
        FROM public.inventory_reservations
        WHERE warehouse_id = v_warehouse_id 
          AND product_id = v_product_id 
          AND status = 'reserved';

        IF (v_warehouse_qty + p_quantity_change) < v_reserved_qty THEN
            RAISE EXCEPTION 'Cannot adjust stock below active reservations (Reserved: %, Requested Remaining: %)', v_reserved_qty, (v_warehouse_qty + p_quantity_change);
        END IF;
    END IF;

    -- 8. Apply changes
    UPDATE public.product_batches
    SET available_quantity = available_quantity + p_quantity_change,
        status = CASE 
            WHEN available_quantity + p_quantity_change = 0 THEN 'depleted'
            ELSE status
        END
    WHERE id = p_batch_id;

    UPDATE public.warehouse_stock
    SET quantity = quantity + p_quantity_change
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

    -- 9. Insert Ledger
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
    ) VALUES (
        v_warehouse_id, v_product_id, p_batch_id, p_quantity_change, p_reason, p_user_id
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Deprecate and securely lock down the legacy adjust_warehouse_stock RPC
CREATE OR REPLACE FUNCTION public.adjust_warehouse_stock(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    RAISE EXCEPTION 'Deprecated and insecure. Use adjust_batch_stock.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
