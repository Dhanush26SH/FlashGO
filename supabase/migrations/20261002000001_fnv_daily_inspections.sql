-- 1. Create table
CREATE TABLE public.fnv_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    product_id UUID NOT NULL REFERENCES public.products(id),
    batch_id UUID NOT NULL REFERENCES public.product_batches(id),
    location_id UUID NOT NULL REFERENCES public.warehouse_locations(id),
    staff_id UUID NOT NULL REFERENCES public.profiles(id),
    inspection_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
    result TEXT NOT NULL CHECK (result IN ('good', 'spoiled', 'damaged', 'quality_issue')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Daily Uniqueness Rule
    UNIQUE(batch_id, location_id, inspection_date)
);

-- 2. RLS
ALTER TABLE public.fnv_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Warehouse staff can view their warehouse fnv inspections" 
ON public.fnv_inspections FOR SELECT 
USING (warehouse_id = (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid()));

-- 3. Create RPC for Good completion
CREATE OR REPLACE FUNCTION public.record_fnv_inspection_good(
    p_location_id UUID,
    p_batch_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
    v_shift RECORD;
    v_batch RECORD;
    v_product RECORD;
    v_placement RECORD;
    v_warehouse_id UUID;
    v_fnv_category_id UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 3. Validate Authenticated Staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id AND is_suspended = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or suspended.';
    END IF;
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Only warehouse staff can perform F&V duties.';
    END IF;
    v_warehouse_id := v_profile.warehouse_id;

    -- 4. Validate Active Shift and Duty
    SELECT * INTO v_shift FROM public.staff_shifts 
    WHERE staff_id = v_user_id AND status = 'active' AND current_duty = 'fnv';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: You must have an active shift with F&V (fnv) duty.';
    END IF;

    -- 5. Validate Batch
    SELECT * INTO v_batch FROM public.product_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found.';
    END IF;
    IF v_batch.warehouse_id != v_warehouse_id THEN
        RAISE EXCEPTION 'Batch does not belong to your warehouse.';
    END IF;

    -- 6. Validate Product, Category
    SELECT * INTO v_product FROM public.products WHERE id = v_batch.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    IF v_product.category_id != v_fnv_category_id THEN
        RAISE EXCEPTION 'Unauthorized: Product does not belong to the Vegetables & Fruits category.';
    END IF;

    -- 7. Validate Placement
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id AND warehouse_id = v_warehouse_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is not located at this placement.';
    END IF;
    IF v_placement.quantity <= 0 THEN
        RAISE EXCEPTION 'Placement has no quantity.';
    END IF;

    -- 8. Insert record
    INSERT INTO public.fnv_inspections 
        (warehouse_id, product_id, batch_id, location_id, staff_id, result) 
    VALUES 
        (v_warehouse_id, v_batch.product_id, p_batch_id, p_location_id, v_user_id, 'good')
    ON CONFLICT (batch_id, location_id, inspection_date) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Update remove_fnv_batch_inventory
CREATE OR REPLACE FUNCTION public.remove_fnv_batch_inventory(
    p_location_id UUID,
    p_batch_id UUID,
    p_removed_qty INTEGER,
    p_scanned_barcode TEXT,
    p_reason TEXT,
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
    v_fnv_category_id UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 1. Validate Reason Whitelist
    IF p_reason NOT IN ('spoiled', 'damaged', 'quality_issue') THEN
        RAISE EXCEPTION 'Invalid reason. Must be spoiled, damaged, or quality_issue.';
    END IF;

    -- 2. Validate Quantity
    IF p_removed_qty <= 0 THEN
        RAISE EXCEPTION 'Removed quantity must be greater than zero.';
    END IF;

    -- 3. Validate Authenticated Staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id AND is_suspended = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or suspended.';
    END IF;
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Only warehouse staff can perform F&V duties.';
    END IF;
    v_warehouse_id := v_profile.warehouse_id;

    -- 4. Validate Active Shift and Duty
    SELECT * INTO v_shift FROM public.staff_shifts 
    WHERE staff_id = p_user_id AND status = 'active' AND current_duty = 'fnv';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: You must have an active shift with F&V (fnv) duty.';
    END IF;

    -- 5. Validate Batch
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

    -- 6. Validate Product, Category, and Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_batch.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    IF v_product.category_id != v_fnv_category_id THEN
        RAISE EXCEPTION 'Unauthorized: Product does not belong to the Vegetables & Fruits category.';
    END IF;
    IF v_product.internal_barcode != p_scanned_barcode AND v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'Barcode mismatch: Scanned barcode does not match the product.';
    END IF;

    -- 7. Validate and decrement Placement (Current Architecture)
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

    -- 8. Perform the removals
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

    -- 9. Ledger Movement
    INSERT INTO public.stock_ledgers (
        warehouse_id, 
        product_id, 
        batch_id, 
        quantity_change, 
        reason, 
        performed_by,
        reference_type
    ) VALUES (
        v_warehouse_id, 
        v_batch.product_id, 
        p_batch_id, 
        -(p_removed_qty), 
        p_reason, 
        p_user_id,
        'fnv_workflow'
    );

    -- 10. Record Inspection Completion
    INSERT INTO public.fnv_inspections 
        (warehouse_id, product_id, batch_id, location_id, staff_id, result) 
    VALUES 
        (v_warehouse_id, v_batch.product_id, p_batch_id, p_location_id, p_user_id, p_reason)
    ON CONFLICT (batch_id, location_id, inspection_date) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true, 
        'removed_quantity', p_removed_qty, 
        'reason', p_reason,
        'remaining_batch_quantity', v_batch.available_quantity - p_removed_qty,
        'batch_status', CASE WHEN v_batch.available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE v_batch.status END
    );
END;
$$;
