-- Migration: 20260916000133_admin_inventory_rpc_update.sql
-- Description: Update admin_get_warehouse_inventory to expose staging quantity

DROP FUNCTION IF EXISTS public.admin_get_warehouse_inventory(UUID);

CREATE OR REPLACE FUNCTION public.admin_get_warehouse_inventory(p_warehouse_id UUID)
RETURNS TABLE (
    product_id UUID,
    sku TEXT,
    name TEXT,
    image_url TEXT,
    price NUMERIC,
    physical_stock INT,
    reserved_stock INT,
    sellable_stock INT,
    staging_quantity INT,
    is_low_stock BOOLEAN
) AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Auth check
    SELECT role INTO v_role 
    FROM public.profiles 
    WHERE id = auth.uid() AND is_suspended = FALSE;

    IF v_role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized: Invalid role';
    END IF;

    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.sku,
        p.name,
        p.image_url,
        p.price,
        COALESCE(ws.quantity, 0) AS physical_stock,
        COALESCE((
            SELECT SUM(ir.quantity)::INT 
            FROM public.inventory_reservations ir 
            WHERE ir.warehouse_id = p_warehouse_id 
              AND ir.product_id = p.id 
              AND ir.status = 'reserved'
        ), 0) AS reserved_stock,
        public.get_sellable_quantity(p_warehouse_id, p.id) AS sellable_stock,
        COALESCE(ws.staging_quantity, 0) AS staging_quantity,
        (public.get_sellable_quantity(p_warehouse_id, p.id) < 20) AS is_low_stock
    FROM public.products p
    LEFT JOIN public.warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = p_warehouse_id
    ORDER BY p.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_get_warehouse_inventory(UUID) TO authenticated;
