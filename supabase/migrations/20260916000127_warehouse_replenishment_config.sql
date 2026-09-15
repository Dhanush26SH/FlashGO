-- Migration 127: Warehouse Replenishment Config

-- 1. Add schema columns
ALTER TABLE public.warehouse_stock
ADD COLUMN reorder_threshold INTEGER,
ADD COLUMN target_stock_level INTEGER;

-- 2. Add strict atomic constraint
ALTER TABLE public.warehouse_stock
ADD CONSTRAINT chk_warehouse_stock_replenishment_pair
CHECK (
    (reorder_threshold IS NULL AND target_stock_level IS NULL)
    OR
    (reorder_threshold IS NOT NULL AND target_stock_level IS NOT NULL AND reorder_threshold >= 0 AND target_stock_level >= reorder_threshold)
);

-- 3. Read RPC: get_replenishment_requirements
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
        SELECT product_id, SUM(quantity) as reserved_qty
        FROM public.inventory_reservations
        WHERE status = 'reserved' AND warehouse_id = p_warehouse_id
        GROUP BY product_id
    ) r ON r.product_id = ws.product_id
    WHERE ws.warehouse_id = p_warehouse_id
    AND p.is_active = true
    ORDER BY replenishment_status ASC, p.name ASC;
END;
$$;

-- 4. Write RPC: admin_update_replenishment_settings
CREATE OR REPLACE FUNCTION public.admin_update_replenishment_settings(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_reorder_threshold INTEGER,
    p_target_stock_level INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Authorize
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized: Must be admin or warehouse manager';
    END IF;

    -- Validate pair logic (also caught by table constraint, but explicitly validated here for good UX)
    IF (p_reorder_threshold IS NULL AND p_target_stock_level IS NOT NULL) OR 
       (p_reorder_threshold IS NOT NULL AND p_target_stock_level IS NULL) THEN
        RAISE EXCEPTION 'Invalid configuration: Both threshold and target must be configured together or both must be NULL';
    END IF;

    IF p_reorder_threshold IS NOT NULL THEN
        IF p_reorder_threshold < 0 THEN
            RAISE EXCEPTION 'reorder_threshold must be >= 0';
        END IF;
        IF p_target_stock_level < p_reorder_threshold THEN
            RAISE EXCEPTION 'target_stock_level must be >= reorder_threshold';
        END IF;
    END IF;

    -- Update ONLY replenishment config
    UPDATE public.warehouse_stock
    SET reorder_threshold = p_reorder_threshold,
        target_stock_level = p_target_stock_level
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Warehouse stock record not found';
    END IF;
END;
$$;
