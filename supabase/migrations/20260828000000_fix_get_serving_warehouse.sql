-- 20260828000000_fix_get_serving_warehouse.sql

-- Drop the old function to ensure clean recreation if the signature changes (though it shouldn't)
DROP FUNCTION IF EXISTS public.get_serving_warehouse(DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.get_serving_warehouse(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
) RETURNS UUID AS $$
DECLARE
    v_warehouse_id UUID;
BEGIN
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE is_active = true
      AND lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY (POWER(lat - p_lat, 2) + POWER(lng - p_lng, 2)) ASC
    LIMIT 1;
    
    RETURN v_warehouse_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
