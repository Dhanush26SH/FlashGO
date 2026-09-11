-- Phase 17.2: Inventory Reservations & Authoritative Stock

-- 1. Create the inventory_reservations table
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'consumed', 'released', 'adjusted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a product is only reserved once per order to prevent retry duplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_res_order_product ON public.inventory_reservations(order_id, product_id) WHERE status = 'reserved';

-- Index for calculating available sellable stock at a warehouse
CREATE INDEX IF NOT EXISTS idx_inv_res_warehouse_product ON public.inventory_reservations(warehouse_id, product_id) WHERE status = 'reserved';

-- Enable RLS
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Staff manage reservations" ON public.inventory_reservations
    FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff', 'picker')));

-- 2. Function to calculate true sellable quantity at a warehouse
CREATE OR REPLACE FUNCTION get_sellable_quantity(p_warehouse_id UUID, p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_physical INTEGER := 0;
    v_reserved INTEGER := 0;
BEGIN
    SELECT COALESCE(quantity, 0) INTO v_physical 
    FROM public.warehouse_stock 
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved 
    FROM public.inventory_reservations 
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id AND status = 'reserved';

    RETURN GREATEST(0, v_physical - v_reserved);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Make products.stock_quantity a derived aggregate cache
-- Instead of mutating it during checkout, it should reflect the total global sellable stock (or physical stock).
-- For this scope, we will update products.stock_quantity whenever warehouse_stock or inventory_reservations changes.

CREATE OR REPLACE FUNCTION sync_global_product_stock() RETURNS TRIGGER AS $$
DECLARE
    v_product_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'warehouse_stock' THEN
        v_product_id := COALESCE(NEW.product_id, OLD.product_id);
    ELSIF TG_TABLE_NAME = 'inventory_reservations' THEN
        v_product_id := COALESCE(NEW.product_id, OLD.product_id);
    END IF;

    IF v_product_id IS NOT NULL THEN
        UPDATE public.products p
        SET stock_quantity = (
            SELECT COALESCE(SUM(ws.quantity), 0) FROM public.warehouse_stock ws WHERE ws.product_id = p.id
        ) - (
            SELECT COALESCE(SUM(ir.quantity), 0) FROM public.inventory_reservations ir WHERE ir.product_id = p.id AND ir.status = 'reserved'
        )
        WHERE p.id = v_product_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_stock_from_warehouse ON public.warehouse_stock;
CREATE TRIGGER trigger_sync_stock_from_warehouse
AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_stock
FOR EACH ROW EXECUTE FUNCTION sync_global_product_stock();

DROP TRIGGER IF EXISTS trigger_sync_stock_from_reservations ON public.inventory_reservations;
CREATE TRIGGER trigger_sync_stock_from_reservations
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION sync_global_product_stock();
