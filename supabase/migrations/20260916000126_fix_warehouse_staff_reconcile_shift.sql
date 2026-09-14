CREATE OR REPLACE FUNCTION public.warehouse_staff_reconcile_shift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_slot RECORD;
    v_expired BOOLEAN := false;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Find current active shift
    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active'
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    -- If there's an active shift, check if it's expired
    IF v_active_shift IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.work_slots WHERE id = v_active_shift.work_slot_id;
        
        -- If current time is past the slot's end time, it has expired
        IF v_slot IS NOT NULL AND now() >= v_slot.end_time THEN
            v_expired := true;
            
            -- Transition shift to completed (existing terminal state)
            UPDATE public.staff_shifts 
            SET status = 'completed', 
                completed_at = COALESCE(completed_at, NOW())
            WHERE id = v_active_shift.id;

            -- Force offline
            UPDATE public.profiles
            SET warehouse_is_online = false
            WHERE id = auth.uid();
            
            RETURN jsonb_build_object('status', 'expired', 'shift_id', v_active_shift.id);
        END IF;
        
        RETURN jsonb_build_object('status', 'active', 'shift_id', v_active_shift.id);
    END IF;

    -- If no active shift, ensure they are offline
    IF v_profile.warehouse_is_online = true THEN
        UPDATE public.profiles
        SET warehouse_is_online = false
        WHERE id = auth.uid();
    END IF;

    RETURN jsonb_build_object('status', 'no_active_shift');
END;
$function$;
