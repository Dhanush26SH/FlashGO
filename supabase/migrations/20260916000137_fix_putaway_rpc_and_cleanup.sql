-- Migration 133: Fix Putaway RPC, add capacity check, drop obsolete overloads, and update location verification

CREATE OR REPLACE FUNCTION public.warehouse_putaway_verify_location_qr(
    p_task_id UUID,
    p_scanned_location_qr TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_active_shift RECORD;
    v_task RECORD;
    v_scanned_location RECORD;
BEGIN
    -- Validate worker and state
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'NOT_WAREHOUSE_STAFF';
    END IF;

    IF v_profile.warehouse_is_online != true THEN
        RAISE EXCEPTION 'WAREHOUSE_STAFF_OFFLINE';
    END IF;

    SELECT COUNT(*) INTO v_active_shifts_count FROM public.staff_shifts WHERE staff_id = auth.uid() AND status = 'active';
    IF v_active_shifts_count = 0 THEN
        RAISE EXCEPTION 'SHIFT_NOT_ACTIVE';
    ELSIF v_active_shifts_count > 1 THEN
        RAISE EXCEPTION 'ACTIVE_SHIFT_CONFLICT';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts WHERE staff_id = auth.uid() AND status = 'active' LIMIT 1;
    IF v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'PUTAWAY_DUTY_REQUIRED';
    END IF;

    -- Load task (stateless check, no lock needed here)
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'TASK_NOT_IN_PROGRESS_BY_YOU';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'WAREHOUSE_MISMATCH';
    END IF;

    -- Resolve scanned location via QR
    SELECT * INTO v_scanned_location FROM public.warehouse_locations 
    WHERE barcode = p_scanned_location_qr AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;

    IF v_scanned_location.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;

    -- Compare scanned location identity with authoritative task destination
    IF v_scanned_location.location_code != v_task.destination_location THEN
        -- Provide clear mismatch error
        RETURN jsonb_build_object(
            'status', 'error', 
            'error_code', 'PUTAWAY_LOCATION_MISMATCH',
            'expected', v_task.destination_location,
            'scanned', v_scanned_location.location_code
        );
    END IF;

    RETURN jsonb_build_object('status', 'success', 'location_code', v_scanned_location.location_code, 'location_id', v_scanned_location.id);
END;
$$;

-- Drop obsolete exact overloads
DROP FUNCTION IF EXISTS public.warehouse_putaway_complete(UUID, TEXT);
DROP FUNCTION IF EXISTS public.warehouse_putaway_complete(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_barcode TEXT,
    p_location_id UUID,
    p_quantity INTEGER
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_task RECORD;
    v_product RECORD;
    v_location RECORD;
    v_current_usage INTEGER := 0;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;

    -- Validate worker and state
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL OR v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Invalid shift or duty state';
    END IF;

    -- Lock and load task
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'Task is not in_progress by you';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;
    
    IF v_task.quantity - v_task.placed_quantity < p_quantity THEN
        RAISE EXCEPTION 'Cannot place more than remaining task quantity';
    END IF;

    -- Verify product barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_product.internal_barcode IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_HAS_NO_INTERNAL_BARCODE';
    END IF;
    -- Fix: Must use internal_barcode for FLH labels
    IF v_product.internal_barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- Lock authoritative destination location to prevent concurrent capacity races
    SELECT * INTO v_location FROM public.warehouse_locations 
    WHERE id = p_location_id FOR UPDATE;
    
    IF v_location IS NULL THEN
        RAISE EXCEPTION 'Invalid destination location';
    END IF;

    IF v_location.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'LOCATION_MISMATCH: Location does not belong to this warehouse';
    END IF;

    IF v_location.is_active != true THEN
        RAISE EXCEPTION 'LOCATION_INACTIVE';
    END IF;

    -- Calculate current capacity usage atomically under lock
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_usage
    FROM public.warehouse_product_placements
    WHERE location_id = p_location_id;

    IF v_current_usage + p_quantity > v_location.capacity THEN
        RAISE EXCEPTION 'LOCATION_CAPACITY_EXCEEDED: Usage % + Qty % > Capacity %', v_current_usage, p_quantity, v_location.capacity;
    END IF;
    
    -- Verify staging stock bounds (using row locks)
    -- warehouse_stock
    PERFORM id FROM public.warehouse_stock 
    WHERE product_id = v_task.product_id AND warehouse_id = v_task.warehouse_id AND staging_quantity >= p_quantity FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient warehouse staging stock for putaway';
    END IF;
    
    -- product_batches
    PERFORM id FROM public.product_batches 
    WHERE id = v_task.batch_id AND staging_quantity >= p_quantity FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient batch staging stock for putaway';
    END IF;

    -- Atomically transfer staging -> placed/available
    UPDATE public.warehouse_stock
    SET staging_quantity = staging_quantity - p_quantity,
        quantity = quantity + p_quantity,
        warehouse_location = TRIM(v_location.location_code)
    WHERE product_id = v_task.product_id AND warehouse_id = v_task.warehouse_id;

    UPDATE public.product_batches
    SET staging_quantity = staging_quantity - p_quantity,
        available_quantity = available_quantity + p_quantity
    WHERE id = v_task.batch_id;

    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_location.id, v_task.product_id, p_quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    -- Update Task Progress
    UPDATE public.putaway_tasks
    SET placed_quantity = placed_quantity + p_quantity
    WHERE id = p_task_id;
    
    IF v_task.placed_quantity + p_quantity >= v_task.quantity THEN
        UPDATE public.putaway_tasks
        SET status = 'completed', completed_at = now()
        WHERE id = p_task_id;
    END IF;

    -- Audit log
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
    ) VALUES (
        v_task.warehouse_id, v_task.product_id, v_task.batch_id, p_quantity, 'putaway_activation', auth.uid()
    );

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id, 'placed_quantity', p_quantity, 'remaining', v_task.quantity - (v_task.placed_quantity + p_quantity));
END;
$$;
