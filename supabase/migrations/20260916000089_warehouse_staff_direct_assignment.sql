-- Migration: 20260916000089_warehouse_staff_direct_assignment.sql
-- Description: Direct assignment architecture for Warehouse Staff, plus safeguards.

-- 1. Create admin_create_warehouse_staff_shift
CREATE OR REPLACE FUNCTION public.admin_create_warehouse_staff_shift(
    p_warehouse_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_staff_ids UUID[]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_staff_id UUID;
    v_staff_profile RECORD;
    v_slot_id UUID;
BEGIN
    -- Verify Admin
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Basic Validation
    IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL OR array_length(p_staff_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Must select at least one warehouse staff';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Validate each staff ID for duplicates and roles
    -- Using a unique array approach or just explicit checking
    -- We can rely on array properties for unique but let's just check during the loop

    FOREACH v_staff_id IN ARRAY p_staff_ids
    LOOP
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
    VALUES (p_warehouse_id, 'warehouse_staff', p_start_time, p_end_time, array_length(p_staff_ids, 1), 'published')
    RETURNING id INTO v_slot_id;

    -- Create staff_shifts (using subquery to ensure distinct inserts if frontend sent duplicates)
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
    SELECT DISTINCT u.staff_id, p_warehouse_id, p_start_time, p_end_time, 'scheduled', v_slot_id
    FROM unnest(p_staff_ids) AS u(staff_id);

    RETURN v_slot_id;
END;
$$;


-- 2. Create admin_update_warehouse_staff_shift
CREATE OR REPLACE FUNCTION public.admin_update_warehouse_staff_shift(
    p_slot_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_staff_ids UUID[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
    v_staff_id UUID;
    v_staff_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_staff_ids IS NULL OR array_length(p_staff_ids, 1) IS NULL OR array_length(p_staff_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Must select at least one warehouse staff';
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

    -- Block update if ANY shift is active/completed
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts 
        WHERE work_slot_id = p_slot_id 
        AND status IN ('active', 'completed')
    ) THEN
        RAISE EXCEPTION 'SHIFT_ALREADY_STARTED';
    END IF;

    -- Validate staff IDs and overlap
    FOREACH v_staff_id IN ARRAY p_staff_ids
    LOOP
        SELECT * INTO v_staff_profile FROM public.profiles WHERE id = v_staff_id;
        
        IF v_staff_profile IS NULL OR v_staff_profile.is_suspended = true THEN
            RAISE EXCEPTION 'Worker % is inactive or suspended', v_staff_id;
        END IF;

        IF v_staff_profile.role != 'warehouse_staff' THEN
            RAISE EXCEPTION 'Worker % is not a warehouse staff', v_staff_id;
        END IF;

        IF v_staff_profile.warehouse_id != v_slot.warehouse_id THEN
            RAISE EXCEPTION 'Worker % does not belong to the selected warehouse', v_staff_id;
        END IF;

        -- Overlap check (excluding existing shift for THIS slot)
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = v_staff_id
            AND status != 'cancelled'
            AND work_slot_id != p_slot_id
            AND shift_start < p_end_time
            AND shift_end > p_start_time
        ) THEN
            RAISE EXCEPTION 'Worker % has a conflicting shift for this time', v_staff_id;
        END IF;
    END LOOP;

    -- Update work_slot
    UPDATE public.work_slots 
    SET start_time = p_start_time, end_time = p_end_time, capacity = array_length(p_staff_ids, 1)
    WHERE id = p_slot_id;

    -- Cancel scheduled shifts for users not in the new array
    UPDATE public.staff_shifts 
    SET status = 'cancelled', updated_at = NOW()
    WHERE work_slot_id = p_slot_id 
    AND status = 'scheduled'
    AND NOT (staff_id = ANY(p_staff_ids));

    -- For users IN the array:
    FOREACH v_staff_id IN ARRAY (SELECT DISTINCT u.staff_id FROM unnest(p_staff_ids) AS u(staff_id))
    LOOP
        IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE work_slot_id = p_slot_id AND staff_id = v_staff_id AND status = 'scheduled') THEN
            UPDATE public.staff_shifts
            SET shift_start = p_start_time, shift_end = p_end_time
            WHERE work_slot_id = p_slot_id AND staff_id = v_staff_id AND status = 'scheduled';
        ELSE
            -- Insert new
            INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
            VALUES (v_staff_id, v_slot.warehouse_id, p_start_time, p_end_time, 'scheduled', p_slot_id);
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$;


-- 3. Block self-booking for warehouse_staff
CREATE OR REPLACE FUNCTION public.worker_book_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slot RECORD;
    v_profile RECORD;
    v_booked_count INT;
BEGIN
    -- 1. Get profile and check suspension
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    -- BLOCK warehouse_staff from self-booking entirely
    IF v_profile.role::TEXT NOT IN ('picker', 'driver') THEN
        RAISE EXCEPTION 'Worker role not permitted to self-book slots. Warehouse staff are directly assigned.';
    END IF;

    -- 2. Lock the slot
    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    -- 3. Validate slot availability and match
    IF v_slot.status != 'published' THEN
        RAISE EXCEPTION 'Slot is not published';
    END IF;

    IF v_slot.start_time <= NOW() THEN
        RAISE EXCEPTION 'Cannot book a past slot';
    END IF;

    -- Keep existing role match
    IF v_slot.target_role IS DISTINCT FROM v_profile.role::TEXT THEN
        RAISE EXCEPTION 'Role mismatch';
    END IF;

    IF v_slot.warehouse_id IS DISTINCT FROM v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;

    -- 4. Duplicate Check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = auth.uid() 
        AND work_slot_id = p_slot_id 
        AND status != 'cancelled'
    ) THEN
        RAISE EXCEPTION 'Worker already booked this slot';
    END IF;

    -- 5. Capacity Check
    SELECT COUNT(*) INTO v_booked_count 
    FROM public.staff_shifts 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';
    
    IF v_booked_count >= v_slot.capacity THEN
        RAISE EXCEPTION 'Slot is full';
    END IF;

    -- 6. Overlap Check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = auth.uid()
        AND status != 'cancelled'
        AND shift_start < v_slot.end_time
        AND shift_end > v_slot.start_time
    ) THEN
        RAISE EXCEPTION 'Conflicting shift exists for this time';
    END IF;

    -- 7. Book
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
    VALUES (auth.uid(), v_slot.warehouse_id, v_slot.start_time, v_slot.end_time, 'scheduled', p_slot_id);

    RETURN TRUE;
END;
$$;


-- 4. Secure admin_cancel_work_slot
CREATE OR REPLACE FUNCTION public.admin_cancel_work_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL AND v_slot.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot cancel slot for another warehouse';
    END IF;

    -- Safeguard: If any assignment is ACTIVE or COMPLETED, block cancellation of the slot entirely
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts 
        WHERE work_slot_id = p_slot_id 
        AND status IN ('active', 'completed')
    ) THEN
        RAISE EXCEPTION 'Cannot cancel a slot that contains active or completed shifts';
    END IF;

    UPDATE public.work_slots SET status = 'cancelled', updated_at = NOW() WHERE id = p_slot_id;
    
    -- We can safely cancel all remaining shifts since we just verified none are active/completed
    UPDATE public.staff_shifts 
    SET status = 'cancelled' 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';

    RETURN TRUE;
END;
$$;
