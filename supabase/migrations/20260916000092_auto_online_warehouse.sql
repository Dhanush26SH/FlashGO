-- Migration 92: Auto online for Warehouse Staff upon QR check-in

CREATE OR REPLACE FUNCTION public.warehouse_staff_shift_check_in(
    p_shift_id UUID,
    p_qr_token TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
    v_existing_token TEXT;
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    -- STRICT ROLE CHECK: Only warehouse_staff allowed.
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Worker role not permitted to start warehouse staff shifts';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    -- Ownership check
    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    -- Status check
    IF v_shift.status = 'cancelled' OR v_shift.status = 'completed' THEN
        RAISE EXCEPTION 'Shift cannot be started in state: %', v_shift.status;
    END IF;

    -- Retrieve the associated work_slot for generic time validation
    SELECT * INTO v_slot FROM public.work_slots WHERE id = v_shift.work_slot_id;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Associated work slot not found';
    END IF;

    -- 3. Verify QR Token
    -- Check that the QR token belongs to the shift's warehouse and is not expired
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift.warehouse_id
      AND raw_token = p_qr_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NULL THEN
        RAISE EXCEPTION 'This QR does not belong to your booked store or is expired.';
    END IF;

    -- 4. Time Validation (Generic staff rules: 5 min early allowed)
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Activate Shift (Idempotent)
    IF v_shift.status != 'active' THEN
        UPDATE public.staff_shifts
        SET 
            status = 'active', 
            started_at = COALESCE(v_shift.started_at, now())
        WHERE id = p_shift_id;
    END IF;

    -- 6. Make worker ONLINE
    -- This enforces immediate visibility and readiness upon physical check-in.
    UPDATE public.profiles
    SET warehouse_is_online = true
    WHERE id = auth.uid();
    
    RETURN jsonb_build_object('success', true);
END;
$$;
