-- Migration: 20260830000004_warehouse_product_locations.sql
-- Description: Move product physical location to warehouse-specific scope

-- 1. Add warehouse-specific location field
ALTER TABLE public.warehouse_stock ADD COLUMN warehouse_location TEXT;

-- 2. Migrate existing global location data into the new warehouse-scoped field
-- Only sets it if the product has a location defined. Does not drop the old column yet to prevent breakage.
UPDATE public.warehouse_stock ws
SET warehouse_location = p.warehouse_location
FROM public.products p
WHERE ws.product_id = p.id 
  AND p.warehouse_location IS NOT NULL 
  AND p.warehouse_location != '';

-- 3. Secure Admin RPC for updating location independently of physical stock
CREATE OR REPLACE FUNCTION public.admin_set_product_location(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_location TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_normalized_loc TEXT;
BEGIN
    -- Auth & Admin check
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Only Admins can modify warehouse layout locations';
    END IF;

    -- Validate warehouse exists
    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Warehouse not found';
    END IF;

    -- Validate product exists
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    -- Normalize location string
    IF p_location IS NULL OR TRIM(p_location) = '' THEN
        v_normalized_loc := NULL;
    ELSE
        v_normalized_loc := UPPER(TRIM(p_location));
    END IF;

    -- Update strictly the warehouse_location metadata field
    -- We do NOT insert if it doesn't exist, because a product must be formally provisioned into a warehouse first
    UPDATE public.warehouse_stock
    SET warehouse_location = v_normalized_loc
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is not provisioned in this warehouse stock ledger';
    END IF;
END;
$$;

-- Secure execute privileges
REVOKE EXECUTE ON FUNCTION public.admin_set_product_location(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_product_location(UUID, UUID, TEXT) TO authenticated;
