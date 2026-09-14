-- Migration 20260916000122_fix_shift_expiry_column.sql
-- Removes invalid updated_at column references from reconcile_worker_shifts

CREATE OR REPLACE FUNCTION public.reconcile_worker_shifts(p_staff_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_shift RECORD;
    v_next_shift RECORD;
    v_changes_made BOOLEAN;
    v_staff_role public.user_role;
    v_effective_start TIMESTAMPTZ;
    v_effective_end TIMESTAMPTZ;
    v_active_minutes INT;
BEGIN
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = p_staff_id;

    LOOP
        v_changes_made := false;

        FOR v_active_shift IN 
            SELECT * FROM public.staff_shifts 
            WHERE staff_id = p_staff_id AND status = 'active' AND now() >= shift_end
            FOR UPDATE
        LOOP
            -- Close the active shift authoritatively (removed invalid updated_at)
            UPDATE public.staff_shifts 
            SET status = 'completed', 
                completed_at = COALESCE(completed_at, NOW()) -- Set exact completion time
            WHERE id = v_active_shift.id
            RETURNING * INTO v_active_shift;
            
            v_changes_made := true;

            -- Trigger Bonus Evaluator for Pickers
            IF v_staff_role = 'picker'::public.user_role THEN
                PERFORM public.evaluate_picker_bonus_offers(p_staff_id, v_active_shift.completed_at);
            END IF;

            -- Generate Payout if valid picker rate exists
            IF v_staff_role = 'picker'::public.user_role AND v_active_shift.picker_rate_snapshot IS NOT NULL AND v_active_shift.picker_rate_snapshot > 0 THEN
                v_effective_end := LEAST(now(), v_active_shift.shift_end);
                v_effective_start := COALESCE(v_active_shift.started_at, v_active_shift.shift_start);
                v_active_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_effective_end - v_effective_start)) / 60));

                INSERT INTO public.staff_shift_payouts (
                    staff_id, shift_id, work_slot_id, warehouse_id, role,
                    items_count, active_minutes, shift_started_at, shift_ended_at, earning_date,
                    base_amount, incentive_amount, total_amount, status
                ) VALUES (
                    p_staff_id,
                    v_active_shift.id,
                    v_active_shift.work_slot_id,
                    v_active_shift.warehouse_id,
                    v_staff_role,
                    COALESCE(v_active_shift.items_picked, 0),
                    v_active_minutes,
                    v_effective_start,
                    v_effective_end,
                    (v_effective_start AT TIME ZONE 'Asia/Kolkata')::DATE,
                    0, 0, 0, 'earned'
                ) ON CONFLICT (shift_id) DO NOTHING;
                
                -- Update amounts
                UPDATE public.staff_shift_payouts sp
                SET base_amount = (s.items_picked * s.picker_rate_snapshot),
                    incentive_amount = COALESCE((
                        SELECT SUM(reward_amount)
                        FROM public.picker_shift_incentive_milestones m
                        WHERE m.shift_id = s.id AND m.target_items <= s.items_picked
                    ), 0)
                FROM public.staff_shifts s
                WHERE sp.shift_id = v_active_shift.id AND s.id = v_active_shift.id;
                
                UPDATE public.staff_shift_payouts
                SET total_amount = base_amount + incentive_amount
                WHERE shift_id = v_active_shift.id;
            END IF;
        END LOOP;

        EXIT WHEN NOT v_changes_made;
    END LOOP;

    -- Look for a valid pending scheduled shift to activate
    SELECT * INTO v_next_shift
    FROM public.staff_shifts
    WHERE staff_id = p_staff_id 
      AND status = 'scheduled'
      AND now() >= shift_start 
      AND now() < shift_end
    ORDER BY shift_start ASC
    LIMIT 1;

    IF v_next_shift IS NOT NULL THEN
        -- Removed invalid updated_at
        UPDATE public.staff_shifts 
        SET status = 'active', started_at = COALESCE(started_at, now())
        WHERE id = v_next_shift.id;
    END IF;
END;
$$;
