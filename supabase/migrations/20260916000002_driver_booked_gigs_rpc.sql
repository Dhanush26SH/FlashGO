CREATE OR REPLACE FUNCTION public.get_driver_booked_gigs()
 RETURNS TABLE(
    id uuid, 
    warehouse_id uuid, 
    warehouse_name text, 
    target_role text, 
    start_time timestamp with time zone, 
    end_time timestamp with time zone, 
    capacity integer, 
    booked_count bigint, 
    estimated_hourly_rate_min numeric, 
    estimated_hourly_rate_max numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        w.name AS warehouse_name,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count,
        ws.estimated_hourly_rate_min,
        ws.estimated_hourly_rate_max
    FROM public.work_slots ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    JOIN public.staff_shifts my_ss ON my_ss.work_slot_id = ws.id
    WHERE my_ss.staff_id = auth.uid()
      AND my_ss.status != 'cancelled'
    ORDER BY ws.start_time ASC;
END;
$function$;
