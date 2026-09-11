-- 20260904000003_fix_get_serving_warehouse_radius.sql
-- Relax the service radius constraint to ensure a warehouse is always returned
-- for demo purposes when using browser geolocation.

DROP FUNCTION IF EXISTS public.get_serving_warehouse(FLOAT, FLOAT);
DROP FUNCTION IF EXISTS public.get_serving_warehouse(DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.get_serving_warehouse(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS UUID AS $$
DECLARE
    v_warehouse_id UUID;
BEGIN
    IF p_lat IS NULL OR p_lng IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
        RETURN NULL;
    END IF;

    -- Pick the nearest active warehouse, ignoring service_radius_km limit for demo stability
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE is_active = true
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY public.haversine_distance_km(p_lat, p_lng, lat, lng) ASC
    LIMIT 1;
    
    RETURN v_warehouse_id;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;
