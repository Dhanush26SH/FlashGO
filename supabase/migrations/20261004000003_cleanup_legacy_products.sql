-- Migration: 20261004000003_cleanup_legacy_products.sql
-- Safely cleans up the 6 legacy inactive Baked Pita Chips and 1 legacy Maaza Mango Drink

DO $$
DECLARE
    v_targets UUID[] := ARRAY[
        'f3c1cc57-a2d1-499e-80c8-705c5fc12fe3'::UUID, -- Baked Pita Chips (SKU-7507CA99)
        'd44fb868-19f8-4483-8303-792c294e1af3'::UUID, -- Baked Pita Chips (SKU-71D3A730)
        '4606659b-f0b2-40b7-a00e-42629c6fcf46'::UUID, -- Baked Pita Chips (SKU-ECBA870B)
        '819ba37e-29c8-4501-a3f2-ccb60aec3778'::UUID, -- Baked Pita Chips (SKU-A152FE21)
        'a23bf886-c599-4859-b653-05f953a8e0fc'::UUID, -- Baked Pita Chips (SKU-C2B00E00)
        'ba0c1013-dc53-44c5-a4fc-ffe5cdd426ac'::UUID, -- Baked Pita Chips (SKU-41CB6DBF)
        'e1882467-4d0d-4e04-bb91-3db69326e87f'::UUID  -- Maaza Mango Drink (SKU-39089BED)
    ];
    v_active_count INT;
    v_orders_count INT;
    v_carts_count INT;
    v_reservations_count INT;
    v_po_count INT;
    v_grn_count INT;
    v_operational_ledgers INT;
BEGIN

    -- ASSERTION 1: Ensure no target product is currently active
    SELECT COUNT(*) INTO v_active_count FROM public.products WHERE id = ANY(v_targets) AND is_active = TRUE;
    IF v_active_count > 0 THEN
        RAISE EXCEPTION 'FATAL: One or more target products are active!';
    END IF;

    -- ASSERTION 2: No order_items
    SELECT COUNT(*) INTO v_orders_count FROM public.order_items WHERE product_id = ANY(v_targets);
    IF v_orders_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have order_items!';
    END IF;

    -- ASSERTION 3: No cart_items
    SELECT COUNT(*) INTO v_carts_count FROM public.cart_items WHERE product_id = ANY(v_targets);
    IF v_carts_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have cart_items!';
    END IF;

    -- ASSERTION 4: No inventory_reservations
    SELECT COUNT(*) INTO v_reservations_count FROM public.inventory_reservations WHERE product_id = ANY(v_targets);
    IF v_reservations_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have inventory_reservations!';
    END IF;

    -- ASSERTION 5: No procurement_order_items
    SELECT COUNT(*) INTO v_po_count FROM public.procurement_order_items WHERE product_id = ANY(v_targets);
    IF v_po_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have procurement_order_items!';
    END IF;

    -- ASSERTION 6: No goods_receipt_items
    SELECT COUNT(*) INTO v_grn_count FROM public.goods_receipt_items WHERE product_id = ANY(v_targets);
    IF v_grn_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have goods_receipt_items!';
    END IF;

    -- ASSERTION 7: No genuine operational history (stock_ledgers)
    SELECT COUNT(*) INTO v_operational_ledgers FROM public.stock_ledgers 
    WHERE product_id = ANY(v_targets) AND reference_type NOT IN ('seed_data', 'initial_seed');
    IF v_operational_ledgers > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have operational stock ledgers!';
    END IF;

    -- If all guards pass, explicitly cascade delete only the proven artifacts in safe order
    DELETE FROM public.warehouse_product_placements WHERE product_id = ANY(v_targets);
    DELETE FROM public.warehouse_stock WHERE product_id = ANY(v_targets);
    DELETE FROM public.stock_ledgers WHERE product_id = ANY(v_targets);
    DELETE FROM public.product_batches WHERE product_id = ANY(v_targets);
    DELETE FROM public.products WHERE id = ANY(v_targets);

END $$;
