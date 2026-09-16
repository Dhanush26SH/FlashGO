-- Migration 20260916000167_fix_staff_active_return_recovery.sql

-- 1. Fix start_time typo in staff_get_my_active_return_intake
CREATE OR REPLACE FUNCTION public.staff_get_my_active_return_intake()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_active_count INTEGER;
    v_intake public.return_intakes;
    v_driver public.profiles;
BEGIN
    v_staff_id := auth.uid();

    -- 1. Verify Role
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- 2. Require Active Shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- 3. Check for multiple active intakes
    SELECT COUNT(*) INTO v_active_count
    FROM public.return_intakes
    WHERE received_by_staff_id = v_staff_id
      AND warehouse_id = v_active_shift.warehouse_id
      AND status IN ('pending', 'scanning');

    IF v_active_count > 1 THEN
        RAISE EXCEPTION 'Conflict: Multiple active return intakes found. Please contact support.';
    END IF;

    IF v_active_count = 0 THEN
        RETURN NULL;
    END IF;

    -- 4. Get the single active intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE received_by_staff_id = v_staff_id
      AND warehouse_id = v_active_shift.warehouse_id
      AND status IN ('pending', 'scanning')
    LIMIT 1;

    SELECT * INTO v_driver
    FROM public.profiles
    WHERE id = v_intake.driver_id;

    RETURN jsonb_build_object(
        'id', v_intake.id,
        'status', v_intake.status,
        'driver_name', v_driver.full_name
    );
END;
$$;

-- 2. Fix start_time typo in staff_abandon_return_intake
CREATE OR REPLACE FUNCTION public.staff_abandon_return_intake(
    p_intake_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_active_shift public.staff_shifts;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization & Active Shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Lock Intake & Task FOR UPDATE to prevent race conditions
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    IF v_intake.warehouse_id != v_active_shift.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse';
    END IF;

    IF v_intake.status != 'scanning' THEN
        RAISE EXCEPTION 'Intake is not scanning';
    END IF;

    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_intake.driver_return_task_id FOR UPDATE;

    IF v_task.status != 'required' THEN
        RAISE EXCEPTION 'Task is not required';
    END IF;
    
    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'Only merchandise tasks can be abandoned via this flow';
    END IF;

    -- Strict validation based on reason
    IF p_reason = 'invalid_expected_items' THEN
        IF v_task.order_id IS NOT NULL THEN
            RAISE EXCEPTION 'Task has an order_id. Cannot abandon for invalid_expected_items.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.return_intake_items WHERE return_intake_id = p_intake_id) THEN
            RAISE EXCEPTION 'Intake items exist. Cannot abandon.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.return_scan_operations WHERE return_intake_id = p_intake_id) THEN
            RAISE EXCEPTION 'Scan operations exist. Cannot abandon.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid reason';
    END IF;

    -- Execute Abandonment
    UPDATE public.return_intakes
    SET status = 'voided',
        voided_at = NOW(),
        voided_by = v_staff_id,
        void_reason = p_reason
    WHERE id = p_intake_id;

    UPDATE public.driver_return_tasks
    SET status = 'voided'
    WHERE id = v_task.id;

    RETURN jsonb_build_object('success', true);
END;
$$;
