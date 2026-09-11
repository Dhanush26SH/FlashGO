-- 20260902000006_final_notification_hooks.sql

-- 1. Substitutions trigger
CREATE OR REPLACE FUNCTION public.trg_notify_substitutions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_customer_id UUID;
    v_picker_id UUID;
    v_event_key TEXT;
    v_route TEXT;
BEGIN
    SELECT customer_id, picker_id INTO v_customer_id, v_picker_id FROM public.orders WHERE id = NEW.order_id;
    v_event_key := 'sub_' || NEW.id::text || '_' || NEW.status;

    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
        -- Notify Customer
        PERFORM public.write_notification(
            v_customer_id, 'SUBSTITUTION_REQUIRED', 'Item Substitution Required',
            'A picker has proposed a substitution for an out-of-stock item.',
            'order_substitutions', NEW.id::text, v_event_key,
            jsonb_build_object('route', '/customer/orders/' || NEW.order_id::text)
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        IF NEW.status = 'approved' THEN
            -- Notify Picker
            PERFORM public.write_notification(
                v_picker_id, 'SUBSTITUTION_APPROVED', 'Substitution Approved',
                'The customer approved your substitution.',
                'order_substitutions', NEW.id::text, v_event_key,
                jsonb_build_object('route', '/staff/orders')
            );
        ELSIF NEW.status = 'rejected' THEN
            -- Notify Picker
            PERFORM public.write_notification(
                v_picker_id, 'SUBSTITUTION_REJECTED', 'Substitution Rejected',
                'The customer rejected your substitution.',
                'order_substitutions', NEW.id::text, v_event_key,
                jsonb_build_object('route', '/staff/orders')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_notify_substitutions_trigger ON public.order_substitutions;
CREATE TRIGGER trg_notify_substitutions_trigger
AFTER INSERT OR UPDATE ON public.order_substitutions
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_substitutions();

-- 2. Staff Shifts trigger
CREATE OR REPLACE FUNCTION public.trg_notify_staff_shifts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_event_key TEXT;
BEGIN
    -- We only care if an Admin updates it. If the user self-updates, auth.uid() = staff_id.
    IF auth.uid() = NEW.staff_id THEN RETURN NEW; END IF;

    -- Generate a unique key per update timestamp to ensure idempotency while allowing multiple distinct updates
    v_event_key := 'shift_' || NEW.id::text || '_' || EXTRACT(EPOCH FROM now())::text;

    PERFORM public.write_notification(
        NEW.staff_id, 'SHIFT_SCHEDULE_CHANGED', 'Shift Schedule Changed',
        'Your shift schedule has been updated by an administrator.',
        'staff_shifts', NEW.id::text, v_event_key,
        jsonb_build_object('route', '/staff/profile')
    );

    RETURN NEW;
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_notify_staff_shifts_trigger ON public.staff_shifts;
CREATE TRIGGER trg_notify_staff_shifts_trigger
AFTER UPDATE ON public.staff_shifts
FOR EACH ROW
WHEN (OLD.shift_start IS DISTINCT FROM NEW.shift_start OR OLD.shift_end IS DISTINCT FROM NEW.shift_end OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id)
EXECUTE FUNCTION public.trg_notify_staff_shifts();

-- 3. Update reassign_trip to include notification hook
CREATE OR REPLACE FUNCTION public.reassign_trip(p_trip_id uuid, p_driver_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_new_trip_status TEXT := 'pending';
    v_old_driver_id UUID;
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
        PERFORM public.write_notification(
            v_old_driver_id, 'TRIP_CANCELLED', 'Trip Reassigned/Unassigned',
            'A trip previously assigned to you has been reassigned or unassigned.',
            'logistics_trips', p_trip_id::text, 'trip_cancel_' || p_trip_id::text || '_' || EXTRACT(EPOCH FROM now())::text,
            jsonb_build_object('route', '/staff/delivery')
        );
    END IF;

    -- Hook: Notification to New Driver (TRIP_ASSIGNED)
    IF p_driver_id IS NOT NULL AND (v_old_driver_id IS NULL OR v_old_driver_id != p_driver_id) THEN
        PERFORM public.write_notification(
            p_driver_id, 'TRIP_ASSIGNED', 'New Trip Assigned',
            'You have a new delivery trip assigned.',
            'logistics_trips', p_trip_id::text, 'trip_assign_' || p_trip_id::text || '_' || EXTRACT(EPOCH FROM now())::text,
            jsonb_build_object('route', '/staff/delivery')
        );
    END IF;

    RETURN TRUE;
END;
$BODY$;
