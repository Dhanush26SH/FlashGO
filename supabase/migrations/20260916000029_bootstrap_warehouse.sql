-- Migration: 20260916000029_bootstrap_warehouse.sql
-- Description: Automatically bootstrap the D0 layout and product placements for existing warehouses.

DO $$
DECLARE
    v_warehouse RECORD;
    v_layout_result JSONB;
    v_placement_result JSONB;
BEGIN
    FOR v_warehouse IN SELECT id FROM public.warehouses
    LOOP
        -- 1. Bootstrap Physical Layout
        v_layout_result := public.bootstrap_warehouse_physical_layout(v_warehouse.id);
        RAISE NOTICE 'Layout Bootstrap for Warehouse %: %', v_warehouse.id, v_layout_result;

        -- 2. Bootstrap Product Placements
        v_placement_result := public.bootstrap_warehouse_product_placements(v_warehouse.id);
        RAISE NOTICE 'Placement Bootstrap for Warehouse %: %', v_warehouse.id, v_placement_result;
    END LOOP;
END;
$$;
