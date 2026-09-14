-- Migration: 20260916000114_fix_picker_rate_invariant.sql
-- Description: Ensure that picker_shift_check_in rejects shifts without a positive pay rate, and sets explicit search_path.

CREATE OR REPLACE FUNCTION public.picker_shift_check_in(p_shift_id uuid, p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
    v_existing_token TEXT;
    v_rate NUMERIC(10,2);
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    IF v_profile.role NOT IN ('picker', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Worker role not permitted to start picker shifts';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    IF v_shift.status = 'cancelled' OR v_shift.status = 'completed' THEN
        RAISE EXCEPTION 'Shift cannot be started in state: %', v_shift.status;
    END IF;

    -- Retrieve the associated work_slot for time validation
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

    -- 4. Time Validation
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Activate Shift (Idempotent)
    IF v_shift.status != 'active' THEN
        v_rate := COALESCE(v_shift.picker_rate_snapshot, v_slot.picker_pay_rate);
        
        -- INVARIANT: Picker rate must be > 0 at shift start
        IF v_rate IS NULL OR v_rate <= 0 THEN
            RAISE EXCEPTION 'Cannot start shift: Work Slot has no valid picker pay rate configured (%). Please contact Admin.', v_rate;
        END IF;

        UPDATE public.staff_shifts
        SET 
            status = 'active', 
            started_at = COALESCE(v_shift.started_at, now()),
            picker_rate_snapshot = v_rate
        WHERE id = p_shift_id;

        -- Idempotent snapshot of milestones (only targets > 0 and rewards >= 0 are saved by Admin UI)
        INSERT INTO public.picker_shift_incentive_milestones (shift_id, target_items, reward_amount, sort_order)
        SELECT p_shift_id, target_items, reward_amount, sort_order
        FROM public.work_slot_picker_incentives
        WHERE work_slot_id = v_slot.id
        ON CONFLICT (shift_id, target_items) DO NOTHING;
    END IF;

    -- 6. Set online status atomically (restored)
    -- Using the protected server-side mechanism
    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$function$;
