-- 20260828000005_fix_products_rls_and_data.sql
-- 1. CRITICAL: Add explicit blocking RLS policies for INSERT/UPDATE/DELETE on products
-- 2. Fix admin_get_catalog ambiguous column reference
-- 3. Restore products whose prices were corrupted during security testing

-- ============================================================
-- SECTION 1: EXPLICITLY BLOCK direct INSERT/UPDATE/DELETE on products
--
-- The initial migration only had "Anyone read products" (FOR SELECT).
-- RLS in Postgres allows any un-covered operation if no policy
-- matches for that operation type. We need explicit DENY-equivalent
-- policies: a FOR INSERT/UPDATE/DELETE WITH CHECK (false) blocks all.
-- SECURITY DEFINER RPCs bypass RLS so they remain unaffected.
-- ============================================================

-- Block direct INSERT on products for ALL roles (inc. authenticated)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct product insert" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct product insert"
    ON public.products
    FOR INSERT
    WITH CHECK (false);  -- No role may directly INSERT via REST

-- Block direct UPDATE on products for ALL roles
DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct product update" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct product update"
    ON public.products
    FOR UPDATE
    USING (false);  -- No role may directly UPDATE via REST

-- Block direct DELETE on products for ALL roles
DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct product delete" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct product delete"
    ON public.products
    FOR DELETE
    USING (false);  -- No role may directly DELETE via REST

-- ============================================================
-- SECTION 2: Block direct INSERT/UPDATE/DELETE on categories too
-- (categories active toggle must go through admin_set_category_active RPC)
-- ============================================================

DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct category insert" ON public.categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct category insert"
    ON public.categories
    FOR INSERT
    WITH CHECK (false);

DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct category update" ON public.categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct category update"
    ON public.categories
    FOR UPDATE
    USING (false);

DO $$ BEGIN
    DROP POLICY IF EXISTS "Block direct category delete" ON public.categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Block direct category delete"
    ON public.categories
    FOR DELETE
    USING (false);

-- ============================================================
-- SECTION 3: Fix admin_get_catalog — resolve ambiguous "id" column
-- Must DROP first since return type changed (PG disallows OR REPLACE for type changes)
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_get_catalog(TEXT, UUID, BOOLEAN, INT, INT);

CREATE OR REPLACE FUNCTION public.admin_get_catalog(
    p_search_query TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
) RETURNS TABLE(
    product_id UUID,
    product_category_id UUID,
    product_name TEXT,
    product_description TEXT,
    product_price NUMERIC,
    product_discount_price NUMERIC,
    product_image_url TEXT,
    product_sku TEXT,
    product_barcode TEXT,
    product_is_active BOOLEAN,
    product_rating_avg NUMERIC,
    product_rating_count INT,
    product_warehouse_location TEXT,
    product_stock_quantity INT,
    total_count BIGINT
) AS $$
BEGIN
    -- Auth check: only admin can call this
    IF auth.uid() IS NULL OR (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can view full catalog';
    END IF;

    RETURN QUERY
    SELECT
        p.id                AS product_id,
        p.category_id       AS product_category_id,
        p.name              AS product_name,
        p.description       AS product_description,
        p.price             AS product_price,
        p.discount_price    AS product_discount_price,
        p.image_url         AS product_image_url,
        p.sku               AS product_sku,
        p.barcode           AS product_barcode,
        p.is_active         AS product_is_active,
        p.rating_avg        AS product_rating_avg,
        p.rating_count      AS product_rating_count,
        p.warehouse_location AS product_warehouse_location,
        p.stock_quantity    AS product_stock_quantity,
        COUNT(*) OVER()     AS total_count
    FROM public.products p
    WHERE
        (p_search_query IS NULL
            OR p.name ILIKE '%' || p_search_query || '%'
            OR p.sku ILIKE '%' || p_search_query || '%'
            OR p.barcode ILIKE '%' || p_search_query || '%')
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (p_is_active IS NULL OR p.is_active = p_is_active)
    ORDER BY p.name
    LIMIT LEAST(COALESCE(p_limit, 100), 200)
    OFFSET COALESCE(p_offset, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_get_catalog(TEXT, UUID, BOOLEAN, INT, INT) TO authenticated;

-- ============================================================
-- SECTION 4: Restore corrupted product prices from security testing
-- These two products had their prices set to 0.01 by the anon REST
-- update test (which exposed the missing RLS gap, now fixed above).
-- Restoring to reasonable prices that match the existing discount_price context.
-- ============================================================

UPDATE public.products
SET price = 89.00
WHERE id = '888f7899-2f74-4d18-a2b5-dfce6c354287'
  AND name = 'Amul Gold Full Cream Milk';

UPDATE public.products
SET price = 35.00
WHERE id = 'dd69d4dd-2400-4bb2-a6ce-970fc8f9e6cd'
  AND name = 'Amul Kool Kesar';

-- Fix discount_price for Amul Gold that had discount_price=85 (which is now > restored price of 89)
-- 85 < 89 so it's valid — leave as-is.
-- For Amul Kool Kesar: discount_price=28 < price=35 — valid.

-- ============================================================
-- SECTION 5: Re-grant RPCs (idempotent, safe to repeat)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.admin_create_product(TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_product(UUID, TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_category_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_bulk_discount(UUID, DECIMAL) TO authenticated;
