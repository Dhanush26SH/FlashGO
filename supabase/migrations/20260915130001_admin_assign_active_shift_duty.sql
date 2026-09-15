-- 20260915130001_admin_assign_active_shift_duty.sql

-- RPC to assign a duty to an existing active shift where current_duty IS NULL.
-- This hardens the mid-shift duty assignment without modifying start/end times or status.

CREATE OR REPLACE FUNCTION public.admin_assign_active_shift_duty(p_shift_id UUID, p_duty TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_admin RECORD;
    v_shift RECORD;
    v_worker RECORD;
BEGIN
    -- 1. Validate caller is admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = auth.uid();
    IF v_admin IS NULL OR v_admin.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can assign shift duties';
    END IF;

    -- 2. Validate requested duty
    IF p_duty NOT IN ('putaway', 'auditor', 'inward_damage') THEN
        RAISE EXCEPTION 'Invalid duty specified: %', p_duty;
    END IF;

    -- 3. Lock the shift row FOR UPDATE to prevent concurrent assignments
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift % not found', p_shift_id;
    END IF;

    -- 4. Authoritative validations
    SELECT * INTO v_worker FROM public.profiles WHERE id = v_shift.staff_id;
    IF v_worker IS NULL OR v_worker.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Shift belongs to a worker who is not warehouse_staff';
    END IF;

    IF v_shift.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Shift has no valid warehouse assignment';
    END IF;

    IF v_shift.status != 'active' THEN
        RAISE EXCEPTION 'Cannot assign duty: Shift is not active';
    END IF;

    IF v_shift.shift_end <= now() THEN
        RAISE EXCEPTION 'Cannot assign duty: Shift has expired';
    END IF;

    IF v_shift.current_duty IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot assign duty: Worker already has an active duty (%) that must be completed/released first', v_shift.current_duty;
    END IF;

    -- 5. Atomic Update
    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'shift_id', p_shift_id,
        'assigned_duty', p_duty
    );
END;
$function$;
