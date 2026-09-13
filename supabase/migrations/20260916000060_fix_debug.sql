-- 20260916000060_fix_debug.sql
CREATE OR REPLACE FUNCTION public.debug_get_trips()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res json;
BEGIN
    SELECT json_agg(json_build_object(
        'id', t.id,
        'driver_id', t.driver_id,
        'status', t.status,
        'created_at', t.created_at,
        'orders', (SELECT json_agg(json_build_object('id', o.id, 'order_number', o.order_number)) FROM public.orders o WHERE o.trip_id = t.id)
    ))
    INTO res
    FROM (
        SELECT * FROM public.logistics_trips ORDER BY created_at DESC LIMIT 5
    ) t;
    
    RETURN res;
END;
$$;
