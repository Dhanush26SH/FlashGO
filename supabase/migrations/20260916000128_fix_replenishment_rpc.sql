-- Migration 128: Fix Replenishment RPC Ambiguous Column

CREATE OR REPLACE FUNCTION public.get_replenishment_requirements(p_warehouse_id UUID)
RETURNS TABLE (
    warehouse_id UUID,
    product_id UUID,
    product_name TEXT,
    sku TEXT,
    internal_barcode TEXT,
    physical_quantity INTEGER,
    reserved_quantity INTEGER,
    available_to_sell INTEGER,
    reorder_threshold INTEGER,
    target_stock_level INTEGER,
    suggested_reorder_quantity INTEGER,
    replenishment_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    SELECT 
        ws.warehouse_id,
        ws.product_id,
        p.name AS product_name,
        p.sku,
        p.internal_barcode,
        ws.quantity AS physical_quantity,
        COALESCE(r.reserved_qty, 0)::INTEGER AS reserved_quantity,
        GREATEST(ws.quantity - COALESCE(r.reserved_qty, 0), 0)::INTEGER AS available_to_sell,
        ws.reorder_threshold,
        ws.target_stock_level,
        GREATEST(COALESCE(ws.target_stock_level, 0) - GREATEST(ws.quantity - COALESCE(r.reserved_qty, 0), 0), 0)::INTEGER AS suggested_reorder_quantity,
        CASE
            WHEN ws.reorder_threshold IS NULL OR ws.target_stock_level IS NULL THEN 'NOT CONFIGURED'
            WHEN GREATEST(ws.quantity - COALESCE(r.reserved_qty, 0), 0) <= 0 THEN 'OUT OF STOCK'
            WHEN GREATEST(ws.quantity - COALESCE(r.reserved_qty, 0), 0) <= ws.reorder_threshold THEN 'LOW STOCK'
            ELSE 'OK'
        END AS replenishment_status
    FROM public.warehouse_stock ws
    JOIN public.products p ON ws.product_id = p.id
    LEFT JOIN (
        SELECT ir.product_id, SUM(ir.quantity) as reserved_qty
        FROM public.inventory_reservations ir
        WHERE ir.status = 'reserved' AND ir.warehouse_id = p_warehouse_id
        GROUP BY ir.product_id
    ) r ON r.product_id = ws.product_id
    WHERE ws.warehouse_id = p_warehouse_id
    AND p.is_active = true
    ORDER BY replenishment_status ASC, p.name ASC;
END;
$$;
