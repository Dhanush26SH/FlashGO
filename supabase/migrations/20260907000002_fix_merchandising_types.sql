-- 20260907000002_fix_merchandising_types.sql

DROP FUNCTION IF EXISTS public.get_trending_by_tag(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION public.get_trending_by_tag(
    p_warehouse_id UUID,
    p_tag TEXT,
    p_limit INT DEFAULT 8
) RETURNS TABLE (
    id UUID,
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
    stock_quantity INT,
    total_sold BIGINT,
    total_revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH product_sales AS (
        SELECT 
            oi.product_id,
            COALESCE(SUM(oi.quantity), 0)::BIGINT AS total_sold,
            COALESCE(SUM(oi.quantity * oi.price), 0)::NUMERIC AS total_revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE o.status = 'delivered'
        GROUP BY oi.product_id
    )
    SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price::NUMERIC,
        p.discount_price::NUMERIC,
        p.image_url,
        p.sku,
        p.barcode,
        p.is_active,
        p.rating_avg::NUMERIC,
        p.rating_count::INT,
        public.get_sellable_quantity(p_warehouse_id, p.id)::INT AS stock_quantity,
        COALESCE(ps.total_sold, 0)::BIGINT AS total_sold,
        COALESCE(ps.total_revenue, 0)::NUMERIC AS total_revenue
    FROM public.products p
    LEFT JOIN product_sales ps ON ps.product_id = p.id
    WHERE p.is_active = true
      AND p_tag = ANY(p.tags)
      AND public.get_sellable_quantity(p_warehouse_id, p.id) > 0
    ORDER BY 
        COALESCE(ps.total_sold, 0) DESC,
        COALESCE(ps.total_revenue, 0) DESC,
        public.get_sellable_quantity(p_warehouse_id, p.id) DESC,
        p.id ASC
    LIMIT COALESCE(p_limit, 8);
END;
$$;
