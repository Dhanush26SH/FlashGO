-- 20260916000059_debug_orders.sql

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
        'customer_id', o.customer_id,
        'picker_id', o.picker_id,
        'driver_id', o.driver_id,
        'trip_id', o.trip_id,
        'status', o.status,
        'items', (SELECT json_agg(json_build_object('product_name', p.name, 'qty', oi.quantity)) FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = o.id)
    ))
    INTO res
    FROM public.orders o
    WHERE o.id = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228' OR o.order_number = 'FG-20260825-7B6A8';
    
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
        'status', t.status,
        'created_at', t.created_at,
        'orders', (SELECT json_agg(json_build_object('id', o.id, 'order_number', o.order_number)) FROM public.orders o WHERE o.trip_id = t.id)
    ))
    INTO res
    FROM public.logistics_trips t
    ORDER BY t.created_at DESC
    LIMIT 5;
    
    RETURN res;
END;
$$;
