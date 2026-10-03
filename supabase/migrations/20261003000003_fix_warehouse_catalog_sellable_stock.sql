-- Migration to fix get_warehouse_catalog returning physical stock instead of sellable stock
CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(
    p_warehouse_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 500
) RETURNS TABLE(
    product_id UUID,
    category_id UUID,
    subcategory_id UUID,
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
        p.subcategory_id,
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
        GREATEST(0, ws.quantity - COALESCE(
            (SELECT SUM(quantity)::INT 
             FROM public.inventory_reservations r 
             WHERE r.product_id = p.id 
               AND r.warehouse_id = p_warehouse_id 
               AND r.status = 'reserved'
            ), 0
        ))::INT AS stock_quantity
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
