-- 20260902000012_notification_idempotency_closure.sql

-- 1. Fix Staff Shifts Notification NULL Safety
CREATE OR REPLACE FUNCTION public.trg_notify_staff_shifts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_event_key TEXT;
BEGIN
    -- We only care if an Admin updates it. If the user self-updates, auth.uid() = staff_id.
    IF auth.uid() = NEW.staff_id THEN RETURN NEW; END IF;

    -- Generate a deterministic key based on the authoritative shift state with NULL safety for warehouse_id
    v_event_key := 'shift_' || NEW.id::text || '_' || EXTRACT(EPOCH FROM NEW.shift_start)::text || '_' || EXTRACT(EPOCH FROM NEW.shift_end)::text || '_' || COALESCE(NEW.warehouse_id::text, 'none');

    PERFORM public.write_notification(
        NEW.staff_id, 'SHIFT_SCHEDULE_CHANGED', 'Shift Schedule Changed',
        'Your shift schedule has been updated by an administrator.',
        'staff_shifts', NEW.id::text, v_event_key,
        jsonb_build_object('route', '/staff/profile')
    );

    RETURN NEW;
END;
$BODY$;
