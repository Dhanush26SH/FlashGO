-- Migration 95: Fix warehouse putaway claim authorization

CREATE OR REPLACE FUNCTION public.warehouse_putaway_claim(
    p_task_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_active_shift RECORD;
    v_task RECORD;
    v_updated_id UUID;
BEGIN
    -- A. auth.uid() exists & B. role = warehouse_staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_WAREHOUSE_STAFF';
    END IF;

    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'NOT_WAREHOUSE_STAFF';
    END IF;

    -- C. profiles.warehouse_is_online = true
    IF v_profile.warehouse_is_online != true THEN
        RAISE EXCEPTION 'WAREHOUSE_STAFF_OFFLINE';
    END IF;

    -- D. exactly one active staff_shift exists
    SELECT COUNT(*) INTO v_active_shifts_count
    FROM public.staff_shifts
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shifts_count = 0 THEN
        RAISE EXCEPTION 'SHIFT_NOT_ACTIVE';
    ELSIF v_active_shifts_count > 1 THEN
        RAISE EXCEPTION 'ACTIVE_SHIFT_CONFLICT';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active'
    LIMIT 1;

    -- E. active shift current_duty = 'putaway'
    IF v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'PUTAWAY_DUTY_REQUIRED';
    END IF;

    -- Load task for granular error reporting
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;

    -- F. task warehouse matches worker/shift warehouse
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'WAREHOUSE_MISMATCH';
    END IF;

    -- G & H. task status = pending AND worker_id IS NULL
    IF v_task.status != 'pending' OR v_task.worker_id IS NOT NULL THEN
        RAISE EXCEPTION 'TASK_ALREADY_CLAIMED';
    END IF;

    -- Atomic claim (still guarded by WHERE clause for concurrency safety)
    UPDATE public.putaway_tasks
    SET 
        status = 'in_progress',
        worker_id = auth.uid(),
        claimed_at = now()
    WHERE id = p_task_id
      AND status = 'pending'
      AND worker_id IS NULL
      AND warehouse_id = v_profile.warehouse_id
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        -- If it failed here, someone else claimed it in the split millisecond
        RAISE EXCEPTION 'TASK_ALREADY_CLAIMED';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'task_id', v_updated_id);
END;
$$;

-- Also fix warehouse_putaway_complete
CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_barcode TEXT
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
BEGIN
    -- Validate worker and state independently
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

    -- Lock and load task
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

    -- Verify product barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;
    IF v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- STRICT DESTINATION VALIDATION
    SELECT * INTO v_location FROM public.warehouse_locations 
    WHERE location_code = v_task.destination_location AND warehouse_id = v_task.warehouse_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DESTINATION_LOCATION_NOT_FOUND';
    END IF;

    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_location.id, v_task.product_id, v_task.quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(v_task.destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    UPDATE public.putaway_tasks
    SET status = 'completed', completed_at = now()
    WHERE id = p_task_id;

    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details) 
    VALUES (auth.uid(), 'putaway_completed', 'putaway_task', p_task_id, 
            jsonb_build_object('product_id', v_task.product_id, 'barcode', p_scanned_barcode, 'quantity', v_task.quantity, 'destination', v_task.destination_location, 'location_id', v_location.id));

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;

-- Fix warehouse_putaway_release
CREATE OR REPLACE FUNCTION public.warehouse_putaway_release(
    p_task_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_id UUID;
    v_task RECORD;
BEGIN
    -- DO NOT REQUIRE ONLINE STATUS FOR RELEASE
    -- A worker must be able to release a task if they went offline or shift ended.
    
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'TASK_NOT_IN_PROGRESS_BY_YOU';
    END IF;

    UPDATE public.putaway_tasks
    SET status = 'pending', worker_id = NULL, claimed_at = NULL
    WHERE id = p_task_id;

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;
