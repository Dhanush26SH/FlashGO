-- Migration: 20261004000002_cleanup_legacy_avocados.sql
-- Safely cleans up the 6 legacy inactive avocado seed records

DO $$
DECLARE
    v_canonical_id UUID := 'f92b5f3b-33f4-409e-a599-2b055a3f6b96';
    v_targets UUID[] := ARRAY[
        'b02adc28-4003-4bf3-8099-d90608ce1524'::UUID,
        '1928bbee-3990-4a72-93e9-5af9c2037d46'::UUID,
        'cbfd7337-1bc3-429e-b1e2-8ec8a68c2bbc'::UUID,
        '73181fe1-fbdf-46f5-b153-662a8c0c33ba'::UUID,
        '89f2c3bc-2925-44a6-98d6-157672dcff10'::UUID,
        'c0280122-72bb-44db-adf4-fa83fff8e711'::UUID
    ];
    v_active_count INT;
    v_orders_count INT;
    v_carts_count INT;
    v_reservations_count INT;
    v_po_count INT;
    v_grn_count INT;
    v_operational_ledgers INT;
BEGIN
    -- ASSERTION 1: Ensure canonical is NOT in target set
    IF v_canonical_id = ANY(v_targets) THEN
        RAISE EXCEPTION 'FATAL: Canonical product ID is in the target set!';
    END IF;

    -- ASSERTION 2: Ensure no target product is currently active
    SELECT COUNT(*) INTO v_active_count FROM public.products WHERE id = ANY(v_targets) AND is_active = TRUE;
    IF v_active_count > 0 THEN
        RAISE EXCEPTION 'FATAL: One or more target products are active!';
    END IF;

    -- ASSERTION 3: No order_items
    SELECT COUNT(*) INTO v_orders_count FROM public.order_items WHERE product_id = ANY(v_targets);
    IF v_orders_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have order_items!';
    END IF;

    -- ASSERTION 4: No cart_items
    SELECT COUNT(*) INTO v_carts_count FROM public.cart_items WHERE product_id = ANY(v_targets);
    IF v_carts_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have cart_items!';
    END IF;

    -- ASSERTION 5: No inventory_reservations
    SELECT COUNT(*) INTO v_reservations_count FROM public.inventory_reservations WHERE product_id = ANY(v_targets);
    IF v_reservations_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have inventory_reservations!';
    END IF;

    -- ASSERTION 6: No procurement_order_items
    SELECT COUNT(*) INTO v_po_count FROM public.procurement_order_items WHERE product_id = ANY(v_targets);
    IF v_po_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have procurement_order_items!';
    END IF;

    -- ASSERTION 7: No goods_receipt_items
    SELECT COUNT(*) INTO v_grn_count FROM public.goods_receipt_items WHERE product_id = ANY(v_targets);
    IF v_grn_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Target products have goods_receipt_items!';
    END IF;

    -- ASSERTION 8: No genuine operational history (stock_ledgers)
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
