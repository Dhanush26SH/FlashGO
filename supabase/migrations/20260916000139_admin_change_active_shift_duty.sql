-- Migration: 20260916000139_admin_change_active_shift_duty.sql

CREATE OR REPLACE FUNCTION public.admin_change_active_shift_duty(
    p_shift_id UUID,
    p_new_duty TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_role text;
    v_shift record;
    v_has_unfinished_work boolean;
BEGIN
    -- 1. Check if caller is admin
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role IS DISTINCT FROM 'admin' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: Admin only');
    END IF;

    -- 2. Validate canonical duty
    IF p_new_duty NOT IN ('putaway', 'auditor', 'inward_damage') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid duty specified');
    END IF;

    -- 3. Lock shift row FOR UPDATE
    SELECT * INTO v_shift
    FROM public.staff_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Shift not found');
    END IF;

    -- 4. Validate shift is active and not expired
    IF v_shift.status != 'active' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Shift is not active');
    END IF;
    
    IF v_shift.shift_end <= now() THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Shift is already expired');
    END IF;

    -- 5. Validate worker role is still warehouse_staff
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_shift.staff_id AND role = 'warehouse_staff'
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Worker is not a warehouse staff');
    END IF;

    -- 6. Check for unfinished authoritative work if they currently have a duty
    IF v_shift.current_duty IS NOT NULL THEN
        IF v_shift.current_duty = 'putaway' THEN
            -- block if worker owns unfinished putaway_tasks where placed_quantity < quantity and task is pending/in_progress
            SELECT EXISTS (
                SELECT 1 FROM public.putaway_tasks
                WHERE worker_id = v_shift.staff_id
                  AND status IN ('pending', 'in_progress')
                  AND placed_quantity < quantity
            ) INTO v_has_unfinished_work;
            
            IF v_has_unfinished_work THEN
                RETURN jsonb_build_object('status', 'error', 'code', 'ACTIVE_DUTY_WORK_REMAINS', 'message', 'Worker has unfinished putaway tasks');
            END IF;
            
        ELSIF v_shift.current_duty = 'auditor' THEN
            -- block if worker owns an active/counting cycle_count/audit task
            SELECT EXISTS (
                SELECT 1 FROM public.cycle_counts
                WHERE counter_id = v_shift.staff_id
                  AND status = 'counting'
            ) INTO v_has_unfinished_work;
            
            IF v_has_unfinished_work THEN
                RETURN jsonb_build_object('status', 'error', 'code', 'ACTIVE_DUTY_WORK_REMAINS', 'message', 'Worker has an active audit task');
            END IF;
            
        ELSIF v_shift.current_duty = 'inward_damage' THEN
            -- Receiving is atomic; there is no persisted worker-owned in-progress receipt object.
            -- Therefore, no blocking is required for inward_damage.
            NULL;
        END IF;
    END IF;

    -- 7. Update current_duty
    UPDATE public.staff_shifts
    SET current_duty = p_new_duty
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'message', 'Duty changed successfully',
        'shift_id', p_shift_id,
        'new_duty', p_new_duty
    );
END;
$$;
