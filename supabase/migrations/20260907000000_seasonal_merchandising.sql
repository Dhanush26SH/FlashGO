-- 20260907000000_seasonal_merchandising.sql

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS products_tags_gin_idx ON public.products USING GIN (tags);

-- Populate tags with sensible values matching existing products
UPDATE public.products SET tags = array_append(tags, 'season:rainy') WHERE name ILIKE '%tea%' OR name ILIKE '%coffee%' OR name ILIKE '%umbrella%' OR name ILIKE '%mosquito%' OR name ILIKE '%repellent%' OR name ILIKE '%soup%' OR name ILIKE '%noodles%' OR name ILIKE '%maggie%';

UPDATE public.products SET tags = array_append(tags, 'season:summer') WHERE name ILIKE '%ice cream%' OR name ILIKE '%juice%' OR name ILIKE '%drink%' OR name ILIKE '%water%' OR name ILIKE '%sunscreen%' OR name ILIKE '%gel%';

UPDATE public.products SET tags = array_append(tags, 'season:winter') WHERE name ILIKE '%tea%' OR name ILIKE '%coffee%' OR name ILIKE '%moisturiser%' OR name ILIKE '%moisture%' OR name ILIKE '%body wash%' OR name ILIKE '%lotion%';

UPDATE public.products SET tags = array_append(tags, 'festival:diwali') WHERE name ILIKE '%katli%' OR name ILIKE '%sweet%' OR name ILIKE '%chocolate%' OR name ILIKE '%ghee%' OR name ILIKE '%soan papdi%' OR name ILIKE '%rocher%';

UPDATE public.products SET tags = array_append(tags, 'festival:christmas') WHERE name ILIKE '%chocolate%' OR name ILIKE '%cookie%' OR name ILIKE '%cake%' OR name ILIKE '%wine%' OR name ILIKE '%rocher%';

-- Deduplicate tags (requires a small subquery to ensure array is unique)
UPDATE public.products SET tags = ARRAY(SELECT DISTINCT UNNEST(tags)) WHERE tags IS NOT NULL;

-- Create RPC for Seasonal/Festive Merchandising
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
    total_sold NUMERIC,
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
            COALESCE(SUM(oi.quantity), 0) AS total_sold,
            COALESCE(SUM(oi.quantity * oi.price_at_time), 0) AS total_revenue
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
        p.price,
        p.discount_price,
        p.image_url,
        p.sku,
        p.barcode,
        p.is_active,
        p.rating_avg,
        p.rating_count,
        public.get_sellable_quantity(p_warehouse_id, p.id) AS stock_quantity,
        COALESCE(ps.total_sold, 0) AS total_sold,
        COALESCE(ps.total_revenue, 0) AS total_revenue
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

GRANT EXECUTE ON FUNCTION public.get_trending_by_tag(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_by_tag(UUID, TEXT, INT) TO anon;
