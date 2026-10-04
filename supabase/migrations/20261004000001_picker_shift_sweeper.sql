-- Migration: 20261004000001_picker_shift_sweeper.sql

CREATE OR REPLACE FUNCTION public.sweep_expired_picker_shifts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_record RECORD;
BEGIN
    FOR v_record IN 
        SELECT DISTINCT s.staff_id
        FROM public.staff_shifts s
        JOIN public.profiles p ON p.id = s.staff_id
        WHERE s.status = 'active'
          AND now() >= s.shift_end
          AND p.role = 'picker'
    LOOP
        -- 1. Use the exact existing invariant logic to close shifts and compute payouts
        PERFORM public.reconcile_worker_shifts(v_record.staff_id);

        -- 2. Force offline if no active valid shift remains, EXACTLY matching picker_expire_shift()
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_record.staff_id AND is_online = true) THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.staff_shifts
                WHERE staff_id = v_record.staff_id
                  AND status = 'active'
                  AND now() < shift_end + interval '5 minutes'
            ) THEN
                -- Bypass the protective trigger via app.driver_status_update_allowed
                PERFORM set_config('app.driver_status_update_allowed', 'true', true);
                UPDATE public.profiles SET is_online = false WHERE id = v_record.staff_id;
            END IF;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_expired_picker_shifts() TO postgres;

-- Schedule it via pg_cron
SELECT cron.unschedule('flashgo_picker_shift_expiry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flashgo_picker_shift_expiry');

SELECT cron.schedule(
    'flashgo_picker_shift_expiry',
    '* * * * *',
    $$SELECT public.sweep_expired_picker_shifts();$$
);
