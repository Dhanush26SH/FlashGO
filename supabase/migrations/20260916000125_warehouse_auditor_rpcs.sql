-- Migration 125: Warehouse Auditor RPCs and cycle_counts extensions

-- 1. Extend cycle_counts schema
ALTER TABLE public.cycle_counts
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL;

-- 2. Create authoritative Admin RPC for audit creation
CREATE OR REPLACE FUNCTION public.admin_create_warehouse_audit(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_location_id UUID,
    p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
    v_count_id UUID;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid() AND is_suspended = FALSE;
    IF v_caller_role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized: Only Admin or Warehouse Manager can create audits';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Warehouse not found';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.warehouse_locations WHERE id = p_location_id AND warehouse_id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Location not found or does not belong to the selected warehouse';
    END IF;

    -- Verify product is actually mapped to that location
    IF NOT EXISTS (
        SELECT 1 FROM public.warehouse_product_placements 
        WHERE product_id = p_product_id AND location_id = p_location_id AND warehouse_id = p_warehouse_id
    ) THEN
        RAISE EXCEPTION 'Product is not physically mapped to this location';
    END IF;

    INSERT INTO public.cycle_counts (
        warehouse_id, 
        product_id, 
        location_id, 
        status, 
        notes, 
        system_quantity -- We put 0 for now, because actual snapshot happens at submit
    ) VALUES (
        p_warehouse_id, 
        p_product_id, 
        p_location_id, 
        'open', 
        p_note,
        0
    )
    RETURNING id INTO v_count_id;

    RETURN v_count_id;
END;
$$;

-- 3. Claim RPC
CREATE OR REPLACE FUNCTION public.warehouse_audit_claim(
    p_count_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_count RECORD;
    v_updated_id UUID;
    v_existing_counting UUID;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid() AND is_suspended = FALSE;
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    -- Validate active shift with correct duty
    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL THEN
        RAISE EXCEPTION 'No active shift found';
    END IF;
    IF v_active_shift.current_duty != 'auditor' THEN
        RAISE EXCEPTION 'Current duty is not auditor';
    END IF;

    -- Lock cycle count row
    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count IS NULL THEN
        RAISE EXCEPTION 'Audit task not found';
    END IF;
    IF v_count.status != 'open' THEN
        RAISE EXCEPTION 'Audit task is not open';
    END IF;
    IF v_count.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Cross-warehouse audit blocked';
    END IF;
    IF v_count.location_id IS NULL THEN
        RAISE EXCEPTION 'Cannot claim legacy audit task with missing location_id';
    END IF;

    -- Check if worker already has a counting task
    SELECT id INTO v_existing_counting FROM public.cycle_counts
    WHERE counter_id = auth.uid() AND status = 'counting'
    LIMIT 1;
    IF v_existing_counting IS NOT NULL THEN
        RAISE EXCEPTION 'Worker already has an active audit task';
    END IF;

    -- Atomic claim
    UPDATE public.cycle_counts
    SET 
        status = 'counting',
        counter_id = auth.uid()
    WHERE id = p_count_id
    RETURNING id INTO v_updated_id;

    RETURN jsonb_build_object('status', 'success', 'task_id', v_updated_id);
END;
$$;

-- 4. Submit RPC
CREATE OR REPLACE FUNCTION public.warehouse_audit_submit(
    p_count_id UUID,
    p_physical_qty INTEGER,
    p_barcode TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_count RECORD;
    v_product RECORD;
    v_placement_qty INTEGER;
BEGIN
    IF p_physical_qty < 0 THEN
        RAISE EXCEPTION 'Physical quantity cannot be negative';
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid() AND is_suspended = FALSE;
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL THEN
        RAISE EXCEPTION 'No active shift found';
    END IF;
    IF v_active_shift.current_duty != 'auditor' THEN
        RAISE EXCEPTION 'Current duty is not auditor';
    END IF;

    -- Row-lock cycle count
    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count IS NULL THEN
        RAISE EXCEPTION 'Audit task not found';
    END IF;
    IF v_count.status != 'counting' THEN
        RAISE EXCEPTION 'Audit task must be in counting status to submit';
    END IF;
    IF v_count.counter_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Task is claimed by someone else';
    END IF;
    IF v_count.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Cross-warehouse audit blocked';
    END IF;
    IF v_count.location_id IS NULL THEN
        RAISE EXCEPTION 'Authoritative location_id is missing';
    END IF;

    -- Validate barcode against product
    SELECT * INTO v_product FROM public.products WHERE id = v_count.product_id;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Product not found';
    END IF;
    IF p_barcode != v_product.internal_barcode THEN
        RAISE EXCEPTION 'Invalid barcode scanned';
    END IF;

    -- Retrieve CURRENT authoritative physical quantity
    SELECT quantity INTO v_placement_qty 
    FROM public.warehouse_product_placements 
    WHERE location_id = v_count.location_id AND product_id = v_count.product_id;

    IF v_placement_qty IS NULL THEN
        RAISE EXCEPTION 'Product placement not found for this location';
    END IF;

    -- Set system quantity, calculate variance, and submit
    UPDATE public.cycle_counts
    SET 
        system_quantity = v_placement_qty,
        counted_quantity = p_physical_qty,
        variance = p_physical_qty - v_placement_qty,
        status = 'submitted',
        submitted_at = now()
    WHERE id = p_count_id;

    RETURN jsonb_build_object('status', 'success', 'task_id', p_count_id, 'variance', p_physical_qty - v_placement_qty);
END;
$$;
