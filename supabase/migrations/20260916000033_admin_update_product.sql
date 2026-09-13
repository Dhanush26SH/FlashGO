-- Migration 20260916000033_admin_update_product.sql

-- Drop the old RPC to redefine it with new parameters
DROP FUNCTION IF EXISTS public.admin_update_product(UUID, TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_update_product(TEXT, DECIMAL, TEXT, BOOLEAN, TEXT, TEXT, TEXT);


CREATE OR REPLACE FUNCTION public.admin_update_product(
    p_id UUID,
    p_name TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_price NUMERIC DEFAULT NULL,
    p_discount_price NUMERIC DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sku TEXT DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_manufacturer_barcode TEXT DEFAULT NULL,
    p_manufacturer_barcode_verified BOOLEAN DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.products
    SET 
        name = COALESCE(p_name, name),
        category_id = COALESCE(p_category_id, category_id),
        price = COALESCE(p_price, price),
        discount_price = CASE WHEN p_discount_price = -1 THEN NULL ELSE COALESCE(p_discount_price, discount_price) END,
        description = COALESCE(p_description, description),
        sku = COALESCE(p_sku, sku),
        barcode = COALESCE(p_barcode, barcode),
        image_url = COALESCE(p_image_url, image_url),
        is_active = COALESCE(p_is_active, is_active),
        manufacturer_barcode = COALESCE(p_manufacturer_barcode, manufacturer_barcode),
        manufacturer_barcode_verified = COALESCE(p_manufacturer_barcode_verified, manufacturer_barcode_verified)
    WHERE id = p_id;
END;
$$;
