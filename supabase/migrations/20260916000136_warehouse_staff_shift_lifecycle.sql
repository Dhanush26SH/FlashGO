-- Migration: 20260916000136_warehouse_staff_shift_lifecycle.sql
-- Description: Natural Shift Expiry Re-architecture and Server-Authoritative Duty Release.

-- 1. Expire Scheduled & Active Shifts
CREATE OR REPLACE FUNCTION public.warehouse_staff_reconcile_shift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_shift RECORD;
    v_expired_count INT := 0;
    v_active_shift_id UUID;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Expire all past scheduled or active shifts using the authoritative shift_end
    FOR v_shift IN 
        SELECT * FROM public.staff_shifts 
        WHERE staff_id = auth.uid() 
          AND status IN ('active', 'scheduled') 
          AND now() >= shift_end
        FOR UPDATE SKIP LOCKED
    LOOP
        -- If it was scheduled but never started, we mark it as expired/cancelled
        IF v_shift.status = 'scheduled' THEN
            UPDATE public.staff_shifts 
            SET status = 'cancelled' -- Did not show up
            WHERE id = v_shift.id;
        ELSE
            UPDATE public.staff_shifts 
            SET status = 'completed', 
                completed_at = COALESCE(completed_at, NOW())
            WHERE id = v_shift.id;
        END IF;
        
        v_expired_count := v_expired_count + 1;
    END LOOP;

    -- Determine if there is still an active, unexpired shift
    SELECT id INTO v_active_shift_id FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active'
    LIMIT 1;

    IF v_active_shift_id IS NULL THEN
        -- If no active shift exists, forcefully set offline
        IF v_profile.warehouse_is_online = true THEN
            UPDATE public.profiles
            SET warehouse_is_online = false
            WHERE id = auth.uid();
        END IF;
        
        IF v_expired_count > 0 THEN
            RETURN jsonb_build_object('status', 'expired', 'expired_count', v_expired_count);
        ELSE
            RETURN jsonb_build_object('status', 'no_active_shift');
        END IF;
    END IF;

    RETURN jsonb_build_object('status', 'active', 'shift_id', v_active_shift_id);
END;
$function$;

-- 2. Server-Authoritative Duty Release
CREATE OR REPLACE FUNCTION public.warehouse_staff_release_duty(
    p_shift_id UUID
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift RECORD;
    v_blocking_count INT := 0;
BEGIN
    -- Validate caller and shift lock
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shift not found'; END IF;
    IF v_shift.staff_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized: Shift ownership mismatch'; END IF;
    
    -- We can only release duties on active shifts. 
    -- If it's already completed, no need to touch current_duty (preserves history).
    IF v_shift.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Shift is not active');
    END IF;

    -- Idempotent check
    IF v_shift.current_duty IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Duty already unassigned');
    END IF;

    -- Check for blocking work using actual DB models
    IF v_shift.current_duty = 'putaway' THEN
        -- Block if the worker has claimed a putaway task that is NOT fully placed
        SELECT COUNT(*) INTO v_blocking_count 
        FROM public.putaway_tasks 
        WHERE worker_id = auth.uid() 
          AND status IN ('pending', 'in_progress')
          AND placed_quantity < quantity;
          
        IF v_blocking_count > 0 THEN
            RAISE EXCEPTION 'Cannot release Putaway duty: You have % incomplete putaway tasks.', v_blocking_count;
        END IF;

    ELSIF v_shift.current_duty = 'auditor' THEN
        -- Block if the worker has claimed an audit/cycle_count that is NOT submitted
        SELECT COUNT(*) INTO v_blocking_count 
        FROM public.cycle_counts 
        WHERE counter_id = auth.uid() 
          AND status = 'counting';
          
        IF v_blocking_count > 0 THEN
            RAISE EXCEPTION 'Cannot release Auditor duty: You have % incomplete audits.', v_blocking_count;
        END IF;

    ELSIF v_shift.current_duty = 'inward_damage' THEN
        -- Inward is stateless per-worker on the DB side. 
        -- Block count is always 0. Release is allowed when triggered.
        v_blocking_count := 0;
    END IF;

    -- Clear operational duty
    UPDATE public.staff_shifts SET current_duty = NULL WHERE id = p_shift_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Duty released successfully');
END;
$function$;
