-- Migration 124: Warehouse Staff Duty Assignment
-- Enforces per-worker duty assignment strictly from Admin RPC.

-- 1. Safely recreate constraint to include inward_damage
ALTER TABLE public.staff_shifts DROP CONSTRAINT IF EXISTS check_valid_duty;
ALTER TABLE public.staff_shifts ADD CONSTRAINT check_valid_duty 
  CHECK (current_duty IN ('putaway', 'auditor', 'inward_damage', 'inward_receiver', 'damage_expiry', 'fnv'));

-- 2. Modify admin_create_warehouse_staff_shift
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
    -- Verify Admin
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

        IF v_duty NOT IN ('putaway', 'auditor', 'inward_damage') THEN
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


-- 3. Modify admin_update_warehouse_staff_shift
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

        IF v_duty NOT IN ('putaway', 'auditor', 'inward_damage') THEN
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
                -- Shift is active or completed. We cannot change duty.
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


-- 4. Harden warehouse_staff_set_duty against overwriting Admin-assigned duty
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
    v_current_duty TEXT;
    v_in_progress_count INT;
BEGIN
    -- 1. Validate Profile
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    -- 2. Validate Duty (legacy + new)
    IF p_duty NOT IN ('putaway', 'auditor', 'inward_damage', 'fnv', 'inward_receiver', 'damage_expiry') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_DUTY');
    END IF;

    -- 3. Resolve active shift
    SELECT COUNT(*) INTO v_active_shifts_count
    FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shifts_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'SHIFT_NOT_ACTIVE');
    ELSIF v_active_shifts_count > 1 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_SHIFT_CONFLICT');
    END IF;

    -- Retrieve the active shift UUID and current duty
    SELECT id, current_duty INTO v_target_shift_id, v_current_duty
    FROM public.staff_shifts
    WHERE staff_id = auth.uid() AND status = 'active';

    -- NEW: Block duty change if shift already has an assigned duty
    IF v_current_duty IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'DUTY_ALREADY_ASSIGNED_BY_ADMIN');
    END IF;

    -- Block duty change if there's an in_progress putaway task
    SELECT COUNT(*) INTO v_in_progress_count
    FROM public.putaway_tasks
    WHERE worker_id = auth.uid() AND status = 'in_progress';

    IF v_in_progress_count > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_PUTAWAY_TASK');
    END IF;

    -- Update Duty
    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = v_target_shift_id
      AND staff_id = auth.uid()
      AND status = 'active';

    RETURN jsonb_build_object('status', 'success', 'shift_id', v_target_shift_id, 'current_duty', p_duty);
END;
$$;
