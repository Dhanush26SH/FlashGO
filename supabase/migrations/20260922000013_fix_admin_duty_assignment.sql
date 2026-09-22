-- Migration: 20260922000013_fix_admin_duty_assignment.sql
-- Description: Allow Admin to assign damage_expiry, fnv, and inward_receiver duties.

-- 1. Modify admin_create_warehouse_staff_shift
CREATE OR REPLACE FUNCTION public.admin_create_warehouse_staff_shift(
    p_warehouse_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_assignments JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_assignment JSONB;
    v_staff_id UUID;
    v_duty TEXT;
    v_staff_profile RECORD;
    v_slot_id UUID;
    v_seen_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Basic Validation
    IF p_assignments IS NULL OR jsonb_typeof(p_assignments) != 'array' OR jsonb_array_length(p_assignments) = 0 THEN
        RAISE EXCEPTION 'Must select at least one warehouse staff with duty';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Pre-validate assignments
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
    LOOP
        v_staff_id := (v_assignment->>'staff_id')::UUID;
        v_duty := v_assignment->>'duty';

        IF v_staff_id IS NULL OR v_duty IS NULL THEN
            RAISE EXCEPTION 'Invalid assignment object, missing staff_id or duty';
        END IF;

        IF v_duty NOT IN ('putaway', 'auditor', 'inward_damage', 'inward_receiver', 'damage_expiry', 'fnv') THEN
            RAISE EXCEPTION 'Invalid duty: %', v_duty;
        END IF;

        IF v_staff_id = ANY(v_seen_staff_ids) THEN
            RAISE EXCEPTION 'Duplicate staff_id in assignments: %', v_staff_id;
        END IF;
        
        v_seen_staff_ids := array_append(v_seen_staff_ids, v_staff_id);

        SELECT * INTO v_staff_profile FROM public.profiles WHERE id = v_staff_id;
        IF v_staff_profile IS NULL OR v_staff_profile.is_suspended = true THEN
            RAISE EXCEPTION 'Worker % is inactive or suspended', v_staff_id;
        END IF;

        IF v_staff_profile.role != 'warehouse_staff' THEN
            RAISE EXCEPTION 'Worker % is not a warehouse staff', v_staff_id;
        END IF;

        IF v_staff_profile.warehouse_id != p_warehouse_id THEN
            RAISE EXCEPTION 'Worker % does not belong to the selected warehouse', v_staff_id;
        END IF;

        -- Overlap check
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = v_staff_id
            AND status != 'cancelled'
            AND shift_start < p_end_time
            AND shift_end > p_start_time
        ) THEN
            RAISE EXCEPTION 'Worker % has a conflicting shift for this time', v_staff_id;
        END IF;
    END LOOP;

    -- Create work_slot
    INSERT INTO public.work_slots (warehouse_id, target_role, start_time, end_time, capacity, status)
    VALUES (p_warehouse_id, 'warehouse_staff', p_start_time, p_end_time, jsonb_array_length(p_assignments), 'published')
    RETURNING id INTO v_slot_id;

    -- Create staff_shifts per worker with assigned duty
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
    LOOP
        v_staff_id := (v_assignment->>'staff_id')::UUID;
        v_duty := v_assignment->>'duty';
        
        INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id, current_duty)
        VALUES (v_staff_id, p_warehouse_id, p_start_time, p_end_time, 'scheduled', v_slot_id, v_duty);
    END LOOP;

    RETURN v_slot_id;
END;
$$;


-- 2. Modify admin_update_warehouse_staff_shift
CREATE OR REPLACE FUNCTION public.admin_update_warehouse_staff_shift(
    p_slot_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_assignments JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
    v_assignment JSONB;
    v_staff_id UUID;
    v_duty TEXT;
    v_staff_profile RECORD;
    v_existing_shift RECORD;
    v_seen_staff_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_assignments IS NULL OR jsonb_typeof(p_assignments) != 'array' OR jsonb_array_length(p_assignments) = 0 THEN
        RAISE EXCEPTION 'Must select at least one warehouse staff with duty';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;
    
    IF v_slot.target_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'This RPC is only for warehouse staff slots';
    END IF;

    -- Pre-validate assignments array
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
    LOOP
        v_staff_id := (v_assignment->>'staff_id')::UUID;
        v_duty := v_assignment->>'duty';

        IF v_staff_id IS NULL OR v_duty IS NULL THEN
            RAISE EXCEPTION 'Invalid assignment object, missing staff_id or duty';
        END IF;

        IF v_duty NOT IN ('putaway', 'auditor', 'inward_damage', 'inward_receiver', 'damage_expiry', 'fnv') THEN
            RAISE EXCEPTION 'Invalid duty: %', v_duty;
        END IF;
        
        IF v_staff_id = ANY(v_seen_staff_ids) THEN
            RAISE EXCEPTION 'Duplicate staff_id in assignments: %', v_staff_id;
        END IF;
        v_seen_staff_ids := array_append(v_seen_staff_ids, v_staff_id);

        SELECT * INTO v_staff_profile FROM public.profiles WHERE id = v_staff_id;
        IF v_staff_profile IS NULL OR v_staff_profile.is_suspended = true THEN
            RAISE EXCEPTION 'Worker % is inactive or suspended', v_staff_id;
        END IF;

        IF v_staff_profile.warehouse_id != v_slot.warehouse_id THEN
            RAISE EXCEPTION 'Worker % does not belong to the selected warehouse', v_staff_id;
        END IF;
    END LOOP;

    -- Block removal of active/completed shifts
    FOR v_existing_shift IN 
        SELECT * FROM public.staff_shifts WHERE work_slot_id = p_slot_id AND status != 'cancelled'
    LOOP
        IF v_existing_shift.status IN ('active', 'completed') THEN
            -- Must be in the new assignments list
            IF NOT (v_existing_shift.staff_id = ANY(v_seen_staff_ids)) THEN
                RAISE EXCEPTION 'Cannot remove worker % because shift is %', v_existing_shift.staff_id, v_existing_shift.status;
            END IF;
        END IF;
    END LOOP;

    -- Cancel shifts for workers no longer in the array
    UPDATE public.staff_shifts
    SET status = 'cancelled'
    WHERE work_slot_id = p_slot_id
      AND NOT (staff_id = ANY(v_seen_staff_ids))
      AND status = 'scheduled';

    -- Upsert shifts for selected workers
    FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
    LOOP
        v_staff_id := (v_assignment->>'staff_id')::UUID;
        v_duty := v_assignment->>'duty';
        
        SELECT * INTO v_existing_shift FROM public.staff_shifts
        WHERE work_slot_id = p_slot_id AND staff_id = v_staff_id;

        IF FOUND THEN
            IF v_existing_shift.status = 'cancelled' THEN
                -- Re-activate it
                UPDATE public.staff_shifts
                SET status = 'scheduled',
                    shift_start = p_start_time,
                    shift_end = p_end_time,
                    current_duty = v_duty
                WHERE id = v_existing_shift.id;
            ELSIF v_existing_shift.status = 'scheduled' THEN
                -- Update times and duty safely
                UPDATE public.staff_shifts
                SET shift_start = p_start_time,
                    shift_end = p_end_time,
                    current_duty = v_duty
                WHERE id = v_existing_shift.id;
            ELSE
                -- Shift is active or completed. We cannot change duty here (must use admin_change_active_shift_duty).
                IF v_existing_shift.current_duty IS DISTINCT FROM v_duty AND v_existing_shift.current_duty IS NOT NULL THEN
                    RAISE EXCEPTION 'Cannot change duty for active/completed shift %', v_existing_shift.id;
                END IF;
                UPDATE public.staff_shifts
                SET shift_end = p_end_time
                WHERE id = v_existing_shift.id AND status = 'active';
            END IF;
        ELSE
            -- Check overlap
            IF EXISTS (
                SELECT 1 FROM public.staff_shifts
                WHERE staff_id = v_staff_id
                AND status != 'cancelled'
                AND shift_start < p_end_time
                AND shift_end > p_start_time
            ) THEN
                RAISE EXCEPTION 'Worker % has a conflicting shift for this time', v_staff_id;
            END IF;

            -- New assignment
            INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id, current_duty)
            VALUES (v_staff_id, v_slot.warehouse_id, p_start_time, p_end_time, 'scheduled', p_slot_id, v_duty);
        END IF;
    END LOOP;

    -- Update slot
    UPDATE public.work_slots
    SET start_time = p_start_time,
        end_time = p_end_time,
        capacity = jsonb_array_length(p_assignments)
    WHERE id = p_slot_id;

    RETURN true;
END;
$$;


-- 3. Modify admin_change_active_shift_duty
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
    IF p_new_duty NOT IN ('putaway', 'auditor', 'inward_damage', 'inward_receiver', 'damage_expiry', 'fnv') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid duty specified: ' || p_new_duty);
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
            
        ELSIF v_shift.current_duty IN ('inward_damage', 'inward_receiver', 'damage_expiry', 'fnv') THEN
            -- No worker-owned in-progress receipt object block required currently
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
