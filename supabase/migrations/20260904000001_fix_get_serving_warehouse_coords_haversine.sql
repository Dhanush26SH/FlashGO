-- Fix get_serving_warehouse function coordinate references
DROP FUNCTION IF EXISTS public.get_serving_warehouse(FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION public.get_serving_warehouse(p_lat FLOAT, p_lng FLOAT)
RETURNS TABLE (
    warehouse_id UUID,
    name TEXT,
    distance_km FLOAT,
    delivery_fee DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id as warehouse_id,
        w.name,
        public.haversine_distance_km(p_lat, p_lng, w.lat, w.lng) as distance_km,
        w.delivery_fee
    FROM public.warehouses w
    WHERE w.is_active = true 
      AND w.service_radius_km > 0
      AND public.haversine_distance_km(p_lat, p_lng, w.lat, w.lng) <= w.service_radius_km
    ORDER BY distance_km ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
