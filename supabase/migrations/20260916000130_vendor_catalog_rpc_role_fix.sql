-- Migration: 20260916000130_vendor_catalog_rpc_role_fix.sql
-- Description: Fixes the role check to use the correct 'warehouse_manager' role enum instead of 'manager'.

CREATE OR REPLACE FUNCTION public.admin_upsert_vendor_product(
    p_vendor_id UUID,
    p_product_id UUID,
    p_vendor_sku TEXT,
    p_purchase_price NUMERIC,
    p_minimum_order_quantity INTEGER,
    p_is_active BOOLEAN
)
RETURNS public.vendor_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vp public.vendor_products;
BEGIN
    -- Authorize
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
          AND role IN ('admin', 'warehouse_manager')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or warehouse managers can manage supplier catalogs';
    END IF;

    -- Validate active mapping requirements
    IF p_is_active = true THEN
        IF p_purchase_price IS NULL OR p_purchase_price <= 0 THEN
            RAISE EXCEPTION 'Active mapping requires purchase_price > 0';
        END IF;
        IF p_minimum_order_quantity IS NULL OR p_minimum_order_quantity < 1 THEN
            RAISE EXCEPTION 'Active mapping requires minimum_order_quantity >= 1';
        END IF;
    END IF;

    -- Upsert mapping
    INSERT INTO public.vendor_products (
        vendor_id, 
        product_id, 
        vendor_sku, 
        purchase_price, 
        minimum_order_quantity, 
        is_active,
        updated_at
    )
    VALUES (
        p_vendor_id, 
        p_product_id, 
        p_vendor_sku, 
        p_purchase_price, 
        p_minimum_order_quantity, 
        p_is_active,
        NOW()
    )
    ON CONFLICT (vendor_id, product_id) DO UPDATE SET
        vendor_sku = EXCLUDED.vendor_sku,
        purchase_price = EXCLUDED.purchase_price,
        minimum_order_quantity = EXCLUDED.minimum_order_quantity,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    RETURNING * INTO v_vp;

    -- Audit log
    PERFORM public.write_admin_audit_log(
        'VENDOR_CATALOG_UPDATED',
        'vendor_products',
        (v_vp.id)::TEXT,
        NULL,
        NULL,
        jsonb_build_object(
            'vendor_id', p_vendor_id,
            'product_id', p_product_id,
            'is_active', p_is_active,
            'purchase_price', p_purchase_price,
            'minimum_order_quantity', p_minimum_order_quantity
        )
    );

    RETURN v_vp;
END;
$$;
