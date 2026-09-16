-- Migration 20260916000168_fix_legacy_return_voiding.sql

-- 1. Fix the driver_return_tasks CHECK constraint to allow voided tasks to have NULL order_id
ALTER TABLE public.driver_return_tasks
  DROP CONSTRAINT IF EXISTS driver_return_tasks_merchandise_order_id_check;

ALTER TABLE public.driver_return_tasks
  ADD CONSTRAINT driver_return_tasks_merchandise_order_id_check
  CHECK (return_type <> 'merchandise' OR order_id IS NOT NULL OR status = 'voided') NOT VALID;

-- 2. Fix the start_time typo in staff_reload_return_intake_items
CREATE OR REPLACE FUNCTION public.staff_reload_return_intake_items(p_intake_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_warehouse_id UUID;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
    v_inserted_count INTEGER;
BEGIN
    v_staff_id := auth.uid();

    -- Check staff authorization
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Active shift required';
    END IF;

    -- Find intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    IF v_intake.status != 'scanning' THEN
        RAISE EXCEPTION 'Cannot reload items for an intake that is not in scanning status';
    END IF;

    -- Find task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_intake.driver_return_task_id FOR UPDATE;

    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'Cannot reload items for non-merchandise return task';
    END IF;

    IF v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Task does not have an associated order_id';
    END IF;

    -- Verify expected item set is currently empty and no received scans exist
    IF EXISTS (SELECT 1 FROM public.return_intake_items WHERE return_intake_id = p_intake_id) THEN
        RAISE EXCEPTION 'Intake items already exist. Cannot reload.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.return_scan_operations WHERE return_intake_id = p_intake_id) THEN
        RAISE EXCEPTION 'Scan operations already exist. Cannot reload.';
    END IF;

    -- Populate expected rows idempotently
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        p_intake_id,
        v_task.order_id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.order_items oi
    WHERE oi.order_id = v_task.order_id;
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'reloaded_count', v_inserted_count);
END;
$$;

-- 3. Fix the start_time typo in staff_start_return_intake(p_driver_id UUID, p_return_type TEXT)
CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_driver_id UUID, p_return_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_warehouse_id UUID;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Check staff authorization
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Active shift required';
    END IF;

    -- Find the pending return task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE driver_id = p_driver_id
      AND return_type = p_return_type
      AND status = 'pending'
      AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending return task of type % found for this driver at this warehouse', p_return_type;
    END IF;

    -- If merchandise, require order_id
    IF v_task.return_type = 'merchandise' AND v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Merchandise return task is missing order_id';
    END IF;

    -- Verify no active intake
    IF EXISTS (
        SELECT 1 FROM public.return_intakes 
        WHERE driver_return_task_id = v_task.id AND status = 'scanning'
    ) THEN
        RAISE EXCEPTION 'An active intake already exists for this return task';
    END IF;

    -- Create intake
    INSERT INTO public.return_intakes (driver_return_task_id, warehouse_id, received_by_staff_id, status)
    VALUES (v_task.id, v_warehouse_id, v_staff_id, 'scanning')
    RETURNING id INTO v_intake_id;

    -- For merchandise, derive expected items from task.order_id -> order_items
    IF v_task.return_type = 'merchandise' THEN
        INSERT INTO public.return_intake_items (
            return_intake_id, order_id, product_id, expected_quantity, received_quantity
        )
        SELECT 
            v_intake_id,
            v_task.order_id,
            oi.product_id,
            oi.quantity,
            0
        FROM public.order_items oi
        WHERE oi.order_id = v_task.order_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'intake_id', v_intake_id);
END;
$$;
