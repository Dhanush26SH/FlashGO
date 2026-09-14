-- Migration 93: Putter task claim and completion lifecycle

-- 1. Extend putaway_tasks constraints and schema
ALTER TABLE public.putaway_tasks
DROP CONSTRAINT IF EXISTS putaway_tasks_status_check;

ALTER TABLE public.putaway_tasks
ADD CONSTRAINT putaway_tasks_status_check 
CHECK (status IN ('pending', 'in_progress', 'completed'));

ALTER TABLE public.putaway_tasks
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- 2. Create atomic claim RPC
CREATE OR REPLACE FUNCTION public.warehouse_putaway_claim(
    p_task_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_updated_id UUID;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    -- Validate active shift with correct duty
    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL THEN
        RAISE EXCEPTION 'No active shift found';
    END IF;
    IF v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Current duty is not putaway';
    END IF;

    -- Atmoic claim
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
        RETURN jsonb_build_object('status', 'error', 'message', 'TASK_ALREADY_CLAIMED_OR_INVALID');
    END IF;

    RETURN jsonb_build_object('status', 'success', 'task_id', v_updated_id);
END;
$$;

-- 3. Create explicit release RPC
CREATE OR REPLACE FUNCTION public.warehouse_putaway_release(
    p_task_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated_id UUID;
BEGIN
    UPDATE public.putaway_tasks
    SET 
        status = 'pending',
        worker_id = NULL,
        claimed_at = NULL
    WHERE id = p_task_id
      AND status = 'in_progress'
      AND worker_id = auth.uid()
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'UNAUTHORIZED_OR_NOT_IN_PROGRESS');
    END IF;

    RETURN jsonb_build_object('status', 'success', 'task_id', v_updated_id);
END;
$$;

-- 4. Create authoritative completion RPC
CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_barcode TEXT
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
BEGIN
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

    -- Verify product barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- Resolve destination location
    -- The old system used plain text in destination_location. Migration 28 introduced warehouse_locations.
    SELECT * INTO v_location FROM public.warehouse_locations 
    WHERE location_code = v_task.destination_location AND warehouse_id = v_task.warehouse_id
    LIMIT 1;

    -- If location doesn't exist natively, we still update the task and legacy stock to unblock operation
    -- but ideally we insert into warehouse_product_placements
    IF v_location IS NOT NULL THEN
        INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
        VALUES (v_task.warehouse_id, v_location.id, v_task.product_id, v_task.quantity, 'putaway')
        ON CONFLICT (location_id, product_id) 
        DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;
    END IF;

    -- Legacy aggregate stock update (from original complete_putaway_task)
    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(v_task.destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    -- Complete task
    UPDATE public.putaway_tasks
    SET 
        status = 'completed',
        completed_at = now()
    WHERE id = p_task_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        auth.uid(), 'putaway_completed', 'putaway_task', p_task_id, 
        jsonb_build_object('product_id', v_task.product_id, 'barcode', p_scanned_barcode, 'quantity', v_task.quantity, 'destination', v_task.destination_location)
    );

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;

-- 5. Harden warehouse_staff_set_duty against active tasks
CREATE OR REPLACE FUNCTION public.warehouse_staff_set_duty(
    p_duty TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_target_shift_id UUID;
    v_in_progress_count INT;
BEGIN
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    IF p_duty NOT IN ('putaway', 'auditor', 'fnv', 'inward_receiver', 'damage_expiry') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_DUTY');
    END IF;

    SELECT COUNT(*) INTO v_active_shifts_count
    FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shifts_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'SHIFT_NOT_ACTIVE');
    ELSIF v_active_shifts_count > 1 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_SHIFT_CONFLICT');
    END IF;

    -- NEW: Block duty change if there's an in_progress putaway task
    SELECT COUNT(*) INTO v_in_progress_count
    FROM public.putaway_tasks
    WHERE worker_id = auth.uid() AND status = 'in_progress';

    IF v_in_progress_count > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_PUTAWAY_TASK');
    END IF;

    SELECT id INTO v_target_shift_id
    FROM public.staff_shifts
    WHERE staff_id = auth.uid() AND status = 'active';

    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = v_target_shift_id
      AND staff_id = auth.uid()
      AND status = 'active';

    RETURN jsonb_build_object('status', 'success', 'shift_id', v_target_shift_id, 'current_duty', p_duty);
END;
$$;

-- 6. Harden warehouse_staff_toggle_online
CREATE OR REPLACE FUNCTION public.warehouse_staff_toggle_online(
    p_is_online BOOLEAN
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_in_progress_count INT;
BEGIN
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_SUSPENDED';
    END IF;

    IF p_is_online = true THEN
        SELECT COUNT(*) INTO v_active_shifts_count
        FROM public.staff_shifts 
        WHERE staff_id = auth.uid() AND status = 'active';

        IF v_active_shifts_count = 0 THEN
            RAISE EXCEPTION 'SHIFT_NOT_ACTIVE';
        END IF;
    ELSE
        -- Going offline. Check for in_progress putaway task
        SELECT COUNT(*) INTO v_in_progress_count
        FROM public.putaway_tasks
        WHERE worker_id = auth.uid() AND status = 'in_progress';

        IF v_in_progress_count > 0 THEN
            RAISE EXCEPTION 'ACTIVE_PUTAWAY_TASK';
        END IF;
    END IF;

    UPDATE public.profiles
    SET warehouse_is_online = p_is_online
    WHERE id = auth.uid();

    RETURN jsonb_build_object('status', 'success', 'is_online', p_is_online);
END;
$$;
