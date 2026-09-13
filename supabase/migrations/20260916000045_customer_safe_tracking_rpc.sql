-- Drop the broad read policy created in migration 44
DROP POLICY IF EXISTS "Customers can read warehouses" ON public.warehouses;

-- Create safe RPC for customer tracking context
CREATE OR REPLACE FUNCTION public.customer_get_order_tracking_context(p_order_id uuid)
RETURNS TABLE (
    warehouse_id uuid,
    warehouse_name text,
    warehouse_lat double precision,
    warehouse_lng double precision,
    delivery_lat double precision,
    delivery_lng double precision,
    assigned_driver_id uuid
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        w.id as warehouse_id,
        w.name as warehouse_name,
        w.lat as warehouse_lat,
        w.lng as warehouse_lng,
        o.delivery_lat,
        o.delivery_lng,
        o.driver_id as assigned_driver_id
    FROM public.orders o
    LEFT JOIN public.warehouses w ON o.warehouse_id = w.id
    WHERE o.id = p_order_id 
    AND o.customer_id = v_user_id;
END;
$$;
