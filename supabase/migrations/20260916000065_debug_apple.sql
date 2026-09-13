-- 20260916000065_debug_apple.sql
CREATE OR REPLACE FUNCTION public.debug_get_apple()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res json;
BEGIN
    SELECT json_build_object(
        'order_status', o.status,
        'order_driver_id', o.driver_id,
        'order_picker_id', o.picker_id,
        'order_trip_id', o.trip_id,
        'trip_status', t.status,
        'trip_driver_id', t.driver_id
    )
    INTO res
    FROM public.orders o
    LEFT JOIN public.logistics_trips t ON o.trip_id = t.id
    WHERE o.id = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228';
    
    RETURN res;
END;
$$;
