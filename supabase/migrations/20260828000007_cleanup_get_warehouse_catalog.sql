-- 20260828000007_cleanup_get_warehouse_catalog.sql
-- Fix overloaded get_warehouse_catalog functions that cause PGRST203 in REST API.

DROP FUNCTION IF EXISTS public.get_warehouse_catalog(UUID);
DROP FUNCTION IF EXISTS public.get_warehouse_catalog(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_warehouse_catalog(UUID, TEXT, INT);
-- The new one has (UUID, TEXT, INT) - keep that one.

-- Re-declare to be absolutely certain it's the only one
CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(
    p_warehouse_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 500
) RETURNS TABLE(
    product_id UUID,
    category_id UUID,
    name TEXT,
    description TEXT,
    price NUMERIC,
    discount_price NUMERIC,
    image_url TEXT,
    sku TEXT,
    barcode TEXT,
    is_active BOOLEAN,
    rating_avg NUMERIC,
    rating_count INT,
    stock_quantity INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.discount_price,
        p.image_url,
        p.sku,
        p.barcode,
        p.is_active,
        p.rating_avg,
        p.rating_count,
        ws.quantity AS stock_quantity
    FROM public.products p
    JOIN public.warehouse_stock ws ON ws.product_id = p.id
    WHERE ws.warehouse_id = p_warehouse_id
      AND p.is_active = true
      AND (
          p_search_query IS NULL 
          OR p.name ILIKE '%' || p_search_query || '%'
          OR p.sku ILIKE '%' || p_search_query || '%'
          OR p.barcode ILIKE '%' || p_search_query || '%'
      )
    ORDER BY p.name ASC
    LIMIT LEAST(COALESCE(p_limit, 500), 1000);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_warehouse_catalog(UUID, TEXT, INT) TO authenticated;
