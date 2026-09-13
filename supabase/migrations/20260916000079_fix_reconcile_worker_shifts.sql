-- Migration: 20260916000079_fix_reconcile_worker_shifts.sql
-- Fix reconcile_worker_shifts to remove invalid updated_at column reference on staff_shifts

CREATE OR REPLACE FUNCTION public.reconcile_worker_shifts(p_staff_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_shift RECORD;
    v_next_shift RECORD;
    v_changes_made BOOLEAN;
BEGIN
    LOOP
        v_changes_made := false;

        -- Find an active shift that has reached its end_time
        FOR v_active_shift IN 
            SELECT * FROM public.staff_shifts 
            WHERE staff_id = p_staff_id AND status = 'active' AND now() >= shift_end
            FOR UPDATE
        LOOP
            -- Look for an exactly consecutive booked shift
            SELECT * INTO v_next_shift 
            FROM public.staff_shifts
            WHERE staff_id = p_staff_id 
              AND status = 'booked' 
              AND shift_start = v_active_shift.shift_end
            FOR UPDATE
            LIMIT 1;

            IF FOUND THEN
                -- Transition seamlessly to consecutive shift
                UPDATE public.staff_shifts SET status = 'completed' WHERE id = v_active_shift.id;
                UPDATE public.staff_shifts SET status = 'active' WHERE id = v_next_shift.id;
                v_changes_made := true;
            ELSE
                -- No consecutive shift. Check if +5 minutes have expired.
                IF now() >= v_active_shift.shift_end + interval '5 minutes' THEN
                    UPDATE public.staff_shifts SET status = 'completed' WHERE id = v_active_shift.id;
                    v_changes_made := true;
                END IF;
            END IF;
        END LOOP;

        EXIT WHEN NOT v_changes_made;
    END LOOP;
END;
$$;
