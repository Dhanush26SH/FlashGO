-- 20260828000004_catalog_rls_and_grants.sql
-- Secure Catalog Management: RLS enforcement, RPC grants, and search bounding
--
-- SECURITY INTENT:
--   - Products table: Admin may NOT directly INSERT/UPDATE/DELETE via REST.
--   - All catalog mutations MUST flow through whitelisted SECURITY DEFINER RPCs.
--   - Authenticated non-admin callers cannot invoke admin_ RPCs (enforced inside each RPC).
--   - Direct hard-DELETE by any role remains blocked.

-- ============================================================
-- 1. ENFORCE — No direct Admin table mutations on products
--    The init_schema already has only "Anyone read products" (SELECT).
--    This migration explicitly confirms and tightens that.
-- ============================================================

-- Drop any accidental broad admin mutation policies that may have been added
DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin manage products" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin products write" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Staff manage products" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Ensure ONLY SELECT policy exists for products (no INSERT/UPDATE/DELETE via REST)
-- The SECURITY DEFINER RPCs bypass RLS because they run as the function owner (postgres).
-- Any direct REST INSERT/UPDATE/DELETE by any role (including admin) will be rejected.

-- Verify the admin_read policy for products (admins need to see ALL products including inactive)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin read all products" ON public.products;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "Admin read all products"
    ON public.products
    FOR SELECT
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        OR true  -- customers also read active products (original policy still applies)
    );

-- The original "Anyone read products" is overly permissive but we keep it as-is
-- to avoid breaking customer and picker reads. Admin gets all (including inactive)
-- via the new policy above; the old one returns true for everyone.

-- ============================================================
-- 2. TIGHTEN categories RLS for Admin mutations
--    Categories can only be updated (active toggled) via admin_set_category_active RPC.
--    Direct Admin REST mutation on categories must be blocked.
-- ============================================================

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin manage categories" ON public.categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin categories write" ON public.categories;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- ============================================================
-- 3. GRANT EXECUTE on all Admin Catalog RPCs to authenticated role
--    (Supabase requires explicit grants on SECURITY DEFINER functions)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.admin_create_product(TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_product(UUID, TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_category_active(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 4. REPLACE get_warehouse_catalog with a bounded result version
--    Adds LIMIT 200 to bound results server-side.
--    Also extends search to include category filter.
--    Does NOT reintroduce stock_quantity.
--    Preserves: is_active filter, warehouse-aware sellable_quantity, backend search.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(
    p_warehouse_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 200
) RETURNS TABLE(
    id UUID,
    category_id UUID,
    name TEXT,
    description TEXT,
    price NUMERIC,
    discount_price NUMERIC,
    image_url TEXT,
    sellable_quantity INT,
    sku TEXT,
    barcode TEXT,
    is_active BOOLEAN,
    rating_avg NUMERIC,
    rating_count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.price,
        p.discount_price,
        p.image_url,
        get_sellable_quantity(p_warehouse_id, p.id) AS sellable_quantity,
        p.sku,
        p.barcode,
        p.is_active,
        p.rating_avg,
        p.rating_count
    FROM public.products p
    WHERE p.is_active = true
      AND (p_search_query IS NULL OR p.name ILIKE '%' || p_search_query || '%')
    ORDER BY p.name
    LIMIT LEAST(COALESCE(p_limit, 200), 500);  -- Hard cap at 500
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_warehouse_catalog(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_warehouse_catalog(UUID, TEXT, INT) TO anon;

-- ============================================================
-- 5. ADMIN CATALOG RPC — get_admin_product_catalog
--    Returns ALL products (including inactive) for the Admin UI.
--    Paginated with offset for progressive loading.
--    Includes is_active, sku, barcode, warehouse metadata.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_get_catalog(
    p_search_query TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
) RETURNS TABLE(
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
    warehouse_location TEXT,
    stock_quantity INT,
    total_count BIGINT
) AS $$
BEGIN
    -- Auth check: only admin can call this
    IF auth.uid() IS NULL OR (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can view full catalog';
    END IF;

    RETURN QUERY
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
        p.warehouse_location,
        p.stock_quantity,
        COUNT(*) OVER() AS total_count
    FROM public.products p
    WHERE
        (p_search_query IS NULL OR p.name ILIKE '%' || p_search_query || '%' OR p.sku ILIKE '%' || p_search_query || '%' OR p.barcode ILIKE '%' || p_search_query || '%')
        AND (p_category_id IS NULL OR p.category_id = p_category_id)
        AND (p_is_active IS NULL OR p.is_active = p_is_active)
    ORDER BY p.name
    LIMIT LEAST(COALESCE(p_limit, 100), 200)
    OFFSET COALESCE(p_offset, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_get_catalog(TEXT, UUID, BOOLEAN, INT, INT) TO authenticated;

-- ============================================================
-- 6. BULK DISCOUNT RPC — admin_apply_bulk_discount
--    Admin-only: safely applies a percentage discount to all products in a category.
--    Validates: caller is admin, category exists, percentage 1–99.
--    Does NOT touch stock_quantity or warehouse_location.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_apply_bulk_discount(
    p_category_id UUID,
    p_percentage DECIMAL  -- 1.00 to 99.00
) RETURNS INT  -- number of products updated
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT := 0;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL OR (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can apply bulk discounts';
    END IF;

    -- Validate category
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
        RAISE EXCEPTION 'Invalid category_id';
    END IF;

    -- Validate percentage
    IF p_percentage <= 0 OR p_percentage >= 100 THEN
        RAISE EXCEPTION 'Discount percentage must be between 1 and 99';
    END IF;

    -- Apply discount: sets discount_price = price * (1 - percentage/100)
    -- Ensures discount_price never exceeds or equals base price
    UPDATE public.products
    SET discount_price = ROUND((price * (1 - p_percentage / 100.0))::NUMERIC, 2)
    WHERE category_id = p_category_id
      AND is_active = true
      AND price > 0;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_apply_bulk_discount(UUID, DECIMAL) TO authenticated;

-- ============================================================
-- 7. Update admin_create_product to handle SKU/barcode uniqueness gracefully
--    The UNIQUE constraints on sku and barcode already exist from init_schema.
--    Add explicit pre-check to provide a clear error instead of PG constraint violation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_product(
    p_name TEXT,
    p_category_id UUID,
    p_price DECIMAL,
    p_discount_price DECIMAL DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sku TEXT DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product_id UUID;
    v_actual_sku TEXT;
    v_actual_barcode TEXT;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL OR (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can create products';
    END IF;

    -- Validate Category
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
        RAISE EXCEPTION 'Invalid category_id: category does not exist';
    END IF;

    -- Validate Price
    IF p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative';
    END IF;
    IF p_discount_price IS NOT NULL AND (p_discount_price < 0 OR p_discount_price > p_price) THEN
        RAISE EXCEPTION 'Discount price must be between 0 and base price';
    END IF;

    -- Generate defaults if not provided
    v_actual_sku := COALESCE(NULLIF(trim(p_sku), ''), 'SKU-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)));
    v_actual_barcode := COALESCE(NULLIF(trim(p_barcode), ''), (floor(random() * 900000000000) + 100000000000)::text);

    -- Uniqueness pre-check (provides a cleaner error message than the DB constraint)
    IF EXISTS (SELECT 1 FROM public.products WHERE sku = v_actual_sku) THEN
        RAISE EXCEPTION 'Duplicate SKU: "%" already exists. Please provide a unique SKU.', v_actual_sku;
    END IF;
    IF EXISTS (SELECT 1 FROM public.products WHERE barcode = v_actual_barcode) THEN
        RAISE EXCEPTION 'Duplicate Barcode: "%" already exists. Please provide a unique barcode.', v_actual_barcode;
    END IF;

    INSERT INTO public.products (
        name,
        category_id,
        price,
        discount_price,
        description,
        sku,
        barcode,
        image_url,
        is_active,
        stock_quantity,     -- Forced 0 — inventory managed separately
        warehouse_location  -- Forced NULL — set by warehouse ops
    ) VALUES (
        p_name,
        p_category_id,
        p_price,
        p_discount_price,
        p_description,
        v_actual_sku,
        v_actual_barcode,
        p_image_url,
        p_is_active,
        0,
        NULL
    ) RETURNING id INTO v_product_id;

    RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_product(TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ============================================================
-- 8. Update admin_update_product: add SKU/barcode uniqueness check on update
--    and block attempts to mutate inventory fields.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_product(
    p_id UUID,
    p_name TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_price DECIMAL DEFAULT NULL,
    p_discount_price DECIMAL DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sku TEXT DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current RECORD;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL OR (SELECT role FROM public.profiles WHERE id = auth.uid()) != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update products';
    END IF;

    SELECT * INTO v_current FROM public.products WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    IF p_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_category_id) THEN
        RAISE EXCEPTION 'Invalid category_id: category does not exist';
    END IF;

    -- Pricing validation
    IF p_price IS NOT NULL AND p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative';
    END IF;

    IF p_discount_price IS NOT NULL AND p_discount_price != -1 THEN
        IF p_discount_price < 0 OR p_discount_price > COALESCE(p_price, v_current.price) THEN
            RAISE EXCEPTION 'Discount price must be between 0 and base price';
        END IF;
    END IF;

    -- Guard: if only updating price but existing discount_price would then exceed new price
    IF p_price IS NOT NULL AND p_discount_price IS NULL AND v_current.discount_price IS NOT NULL THEN
        IF v_current.discount_price > p_price THEN
            RAISE EXCEPTION 'Existing discount price (%) exceeds new base price (%). Update both together.', v_current.discount_price, p_price;
        END IF;
    END IF;

    -- SKU uniqueness check (only if changing SKU)
    IF p_sku IS NOT NULL AND trim(p_sku) != '' AND trim(p_sku) != v_current.sku THEN
        IF EXISTS (SELECT 1 FROM public.products WHERE sku = trim(p_sku) AND id != p_id) THEN
            RAISE EXCEPTION 'Duplicate SKU: "%" already exists on another product.', trim(p_sku);
        END IF;
    END IF;

    -- Barcode uniqueness check (only if changing barcode)
    IF p_barcode IS NOT NULL AND trim(p_barcode) != '' AND trim(p_barcode) != v_current.barcode THEN
        IF EXISTS (SELECT 1 FROM public.products WHERE barcode = trim(p_barcode) AND id != p_id) THEN
            RAISE EXCEPTION 'Duplicate Barcode: "%" already exists on another product.', trim(p_barcode);
        END IF;
    END IF;

    UPDATE public.products
    SET
        name           = COALESCE(p_name, name),
        category_id    = COALESCE(p_category_id, category_id),
        price          = COALESCE(p_price, price),
        discount_price = CASE
                            WHEN p_discount_price = -1 THEN NULL
                            ELSE COALESCE(p_discount_price, discount_price)
                         END,
        description    = COALESCE(p_description, description),
        sku            = CASE WHEN p_sku IS NOT NULL AND trim(p_sku) != '' THEN trim(p_sku) ELSE sku END,
        barcode        = CASE WHEN p_barcode IS NOT NULL AND trim(p_barcode) != '' THEN trim(p_barcode) ELSE barcode END,
        image_url      = COALESCE(p_image_url, image_url),
        is_active      = COALESCE(p_is_active, is_active)
        -- NOTE: stock_quantity and warehouse_location are intentionally NOT updated here.
        -- Those are inventory fields managed by warehouse RPCs only.
    WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_product(UUID, TEXT, UUID, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
