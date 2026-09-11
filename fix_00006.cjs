const fs = require('fs');

let file = 'supabase/migrations/20260902000006_final_notification_hooks.sql';
let text = fs.readFileSync(file, 'utf8');

// Fix malformed AS $ delimiters in 00006
text = text.replace(/AS \$\r?\n/g, 'AS $BODY$\n');
text = text.replace(/END;\r?\n\$;/g, 'END;\n$BODY$;');

// Restore the original reassign_trip business logic (with notification hooks injected)
text = text.replace(/CREATE OR REPLACE FUNCTION public\.reassign_trip[\s\S]*?END;\r?\n\$BODY\$;/g, `CREATE OR REPLACE FUNCTION public.reassign_trip(p_trip_id uuid, p_driver_id uuid)
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
$BODY$;`);

fs.writeFileSync(file, text);
console.log('Fixed 00006 syntax and restored remote reassign_trip business logic.');
