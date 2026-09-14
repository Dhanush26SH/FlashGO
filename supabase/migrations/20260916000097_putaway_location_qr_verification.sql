-- Migration 97: Location QR Verification for Putaway

-- 1. Create stateless verification RPC
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
    v_location RECORD;
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
    -- The schema has UNIQUE(barcode) which serves as the location_qr
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

    RETURN jsonb_build_object('status', 'success', 'location_code', v_scanned_location.location_code);
END;
$$;

-- 2. Update completion RPC to require and verify the Location QR atomically
CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_product_barcode TEXT,
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
    v_product RECORD;
    v_location RECORD;
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

    -- Lock and load task for completion
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'TASK_NOT_IN_PROGRESS_BY_YOU';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'WAREHOUSE_MISMATCH';
    END IF;

    -- Verify authoritative internal FlashGO Product Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;
    IF v_product.internal_barcode IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_HAS_NO_INTERNAL_BARCODE';
    END IF;
    IF v_product.internal_barcode != p_scanned_product_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- Verify authoritative Location QR
    SELECT * INTO v_scanned_location FROM public.warehouse_locations 
    WHERE barcode = p_scanned_location_qr AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;
    
    IF v_scanned_location.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;

    IF v_scanned_location.location_code != v_task.destination_location THEN
        RAISE EXCEPTION 'PUTAWAY_LOCATION_MISMATCH';
    END IF;

    -- Atomically update placement (creates physical inventory at the rack/shelf)
    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_scanned_location.id, v_task.product_id, v_task.quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    -- Legacy aggregate stock update
    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(v_task.destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    -- Complete task
    UPDATE public.putaway_tasks
    SET status = 'completed', completed_at = now()
    WHERE id = p_task_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details) 
    VALUES (auth.uid(), 'putaway_completed', 'putaway_task', p_task_id, 
            jsonb_build_object('product_id', v_task.product_id, 'product_barcode', p_scanned_product_barcode, 'quantity', v_task.quantity, 'destination', v_task.destination_location, 'location_qr', p_scanned_location_qr, 'location_id', v_scanned_location.id));

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;
