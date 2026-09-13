-- 20260916000063_debug_states.sql
CREATE OR REPLACE FUNCTION public.debug_get_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    res json;
BEGIN
    SELECT json_agg(json_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'driver_id', o.driver_id,
        'trip_id', o.trip_id,
        'status', o.status
    ))
    INTO res
    FROM public.orders o
    WHERE o.id = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228' OR o.id = '7b6a87fb-331a-4ef0-b011-074b6e897107';
    
    RETURN res;
END;
$$;

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
        'status', t.status
    ))
    INTO res
    FROM public.logistics_trips t
    WHERE t.id IN ('6e149144-4fcf-4980-bc25-3abec8887804', '9d318fa1-cd1f-4a42-b8d3-ae827a5433d2');
    
    RETURN res;
END;
$$;
