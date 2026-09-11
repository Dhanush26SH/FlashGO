-- Migration: Picker Shift Management

-- Create worker_start_shift RPC to enforce 5-minute pre-start window
CREATE OR REPLACE FUNCTION public.worker_start_shift(p_shift_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    -- If already active, return true idempotently
    IF v_shift.status = 'active' THEN
        RETURN TRUE;
    END IF;

    IF v_shift.status != 'booked' THEN
        RAISE EXCEPTION 'Shift is not in a booked state (status: %)', v_shift.status;
    END IF;

    IF v_shift.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch between worker and shift';
    END IF;

    -- 3. Retrieve the associated work_slot for authoritative time validation
    SELECT * INTO v_slot FROM public.work_slots WHERE id = v_shift.work_slot_id;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Associated work slot not found';
    END IF;

    IF v_slot.status != 'published' THEN
        RAISE EXCEPTION 'Associated work slot is no longer published';
    END IF;

    -- 4. Enforce the 5-minute pre-start window and expiration window
    -- Allowed to start from (start_time - 5 mins) up to end_time
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Update shift status to active
    UPDATE public.staff_shifts
    SET status = 'active', updated_at = now()
    WHERE id = p_shift_id;

    RETURN TRUE;
END;
$$;
