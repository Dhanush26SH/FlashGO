-- 20260902000011_notification_idempotency_fix.sql

-- 1. Fix Staff Shifts Notification Idempotency
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

    -- Generate a deterministic key based on the authoritative shift state
    v_event_key := 'shift_' || NEW.id::text || '_' || EXTRACT(EPOCH FROM NEW.shift_start)::text || '_' || EXTRACT(EPOCH FROM NEW.shift_end)::text || '_' || NEW.warehouse_id::text;

    PERFORM public.write_notification(
        NEW.staff_id, 'SHIFT_SCHEDULE_CHANGED', 'Shift Schedule Changed',
        'Your shift schedule has been updated by an administrator.',
        'staff_shifts', NEW.id::text, v_event_key,
        jsonb_build_object('route', '/staff/profile')
    );

    RETURN NEW;
END;
$BODY$;

-- 2. Fix Trip Reassignment Notification Idempotency
CREATE OR REPLACE FUNCTION public.reassign_trip(p_trip_id uuid, p_driver_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $BODY$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_new_trip_status TEXT := 'pending';
    v_old_driver_id UUID;
    v_cancel_key TEXT;
    v_assign_key TEXT;
BEGIN
    -- Lock trip
    SELECT status, driver_id INTO v_trip_status, v_old_driver_id 
    FROM public.logistics_trips 
    WHERE id = p_trip_id 
    FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot reassign a completed or cancelled trip';
    END IF;

    IF p_driver_id IS NOT NULL THEN
        -- Lock driver
        SELECT role, is_online INTO v_driver_role, v_is_online 
        FROM public.profiles 
        WHERE id = p_driver_id
        FOR UPDATE;

        IF v_driver_role != 'driver' THEN
            RAISE EXCEPTION 'User % is not a driver', p_driver_id;
        END IF;

        IF v_is_online != true THEN
            RAISE EXCEPTION 'Driver % is not online', p_driver_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.logistics_trips 
            WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit') AND id != p_trip_id
        ) THEN
            RAISE EXCEPTION 'Driver % already has an active trip', p_driver_id;
        END IF;

        v_new_trip_status := 'accepted';
    END IF;

    -- Update trip (DO NOT update order status to out_for_delivery)
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = v_new_trip_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync order driver_id
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    -- Hook: Notification to Old Driver (TRIP_CANCELLED)
    IF v_old_driver_id IS NOT NULL AND (p_driver_id IS NULL OR v_old_driver_id != p_driver_id) THEN
        v_cancel_key := 'trip_cancel_' || p_trip_id::text || '_' || v_old_driver_id::text || '_' || COALESCE(p_driver_id::text, 'unassigned');
        PERFORM public.write_notification(
            v_old_driver_id, 'TRIP_CANCELLED', 'Trip Reassigned/Unassigned',
            'A trip previously assigned to you has been reassigned or unassigned.',
            'logistics_trips', p_trip_id::text, v_cancel_key,
            jsonb_build_object('route', '/staff/delivery')
        );
    END IF;

    -- Hook: Notification to New Driver (TRIP_ASSIGNED)
    IF p_driver_id IS NOT NULL AND (v_old_driver_id IS NULL OR v_old_driver_id != p_driver_id) THEN
        v_assign_key := 'trip_assign_' || p_trip_id::text || '_' || p_driver_id::text || '_' || COALESCE(v_old_driver_id::text, 'unassigned');
        PERFORM public.write_notification(
            p_driver_id, 'TRIP_ASSIGNED', 'New Trip Assigned',
            'You have a new delivery trip assigned.',
            'logistics_trips', p_trip_id::text, v_assign_key,
            jsonb_build_object('route', '/staff/delivery')
        );
    END IF;

    RETURN TRUE;
END;
$BODY$;
