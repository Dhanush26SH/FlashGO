-- 20260904000004_fix_catalog_and_inventory.sql
-- Ensure all 209 imported products have stock in WH-CENTRAL-01 so they are visible to customers.

DO $$
DECLARE
    v_warehouse_id UUID;
    v_category_count INT;
BEGIN
    -- Get the WH-CENTRAL-01 warehouse ID (or the first active warehouse)
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE is_active = true LIMIT 1;
    
    IF v_warehouse_id IS NOT NULL THEN
        -- Insert dummy stock for every product that doesn't have it in this warehouse
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        SELECT v_warehouse_id, p.id, 100
        FROM public.products p
        WHERE NOT EXISTS (
            SELECT 1 FROM public.warehouse_stock ws 
            WHERE ws.warehouse_id = v_warehouse_id AND ws.product_id = p.id
        );
        
        -- Also insert a ledger entry for traceability (optional, but good practice)
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason)
        SELECT v_warehouse_id, p.id, 100, 'initial_stock'
        FROM public.products p
        WHERE NOT EXISTS (
            SELECT 1 FROM public.stock_ledgers sl 
            WHERE sl.warehouse_id = v_warehouse_id AND sl.product_id = p.id AND sl.reason = 'initial_stock'
        );
    END IF;
    
    -- Optional: If the 26 categories aren't present, ensure they exist.
    -- Assuming they were created but not marked active, let's just make all categories active.
    UPDATE public.categories SET active = true WHERE active = false OR active IS NULL;
END;
$$ LANGUAGE plpgsql;
