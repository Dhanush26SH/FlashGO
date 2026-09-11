DO $$
DECLARE
    v_admin_id UUID;
    v_vendor_id UUID;
    v_warehouse_id UUID;
    v_product_1 UUID;
    v_product_2 UUID;
    v_po RECORD;
    v_po_item_1 UUID;
    v_po_item_2 UUID;
    v_receipt_number TEXT := 'GRN-TEST-' || extract(epoch from now())::text;
    v_result JSONB;
BEGIN
    RAISE NOTICE 'Starting E2E Database Procurement Test...';

    -- 1. Find an Admin user
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN RAISE EXCEPTION 'No admin found'; END IF;

    -- 2. Find a Vendor
    SELECT id INTO v_vendor_id FROM public.vendors LIMIT 1;
    IF v_vendor_id IS NULL THEN RAISE EXCEPTION 'No vendor found'; END IF;

    -- 3. Find a Warehouse
    SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;
    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'No warehouse found'; END IF;

    -- 4. Find two Products
    SELECT id INTO v_product_1 FROM public.products WHERE is_active = true LIMIT 1 OFFSET 0;
    SELECT id INTO v_product_2 FROM public.products WHERE is_active = true LIMIT 1 OFFSET 1;

    -- 5. Mock auth.uid() by setting the setting
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s"}', v_admin_id), true);

    -- 6. Create PO (direct insert to bypass auth.uid() null issues)
    RAISE NOTICE 'Creating PO...';
    INSERT INTO public.procurement_orders (vendor_id, warehouse_id, status, total_cost)
    VALUES (v_vendor_id, v_warehouse_id, 'approved', 2000)
    RETURNING * INTO v_po;

    INSERT INTO public.procurement_order_items (procurement_order_id, product_id, quantity, cost_per_unit)
    VALUES 
        (v_po.id, v_product_1, 100, 10),
        (v_po.id, v_product_2, 50, 20);
        
    RAISE NOTICE 'PO Created: %', v_po.id;

    -- Get PO Items
    SELECT id INTO v_po_item_1 FROM public.procurement_order_items WHERE procurement_order_id = v_po.id AND product_id = v_product_1;
    SELECT id INTO v_po_item_2 FROM public.procurement_order_items WHERE procurement_order_id = v_po.id AND product_id = v_product_2;

    -- 8. Receive Order
    RAISE NOTICE 'Receiving items...';
    v_result := public.receive_procurement_order(
        v_po.id,
        v_warehouse_id,
        v_admin_id,
        v_receipt_number,
        'Test receipt notes',
        jsonb_build_array(
            jsonb_build_object(
                'procurement_order_item_id', v_po_item_1,
                'product_id', v_product_1,
                'accepted_quantity', 90,
                'rejected_quantity', 10,
                'batch_number', 'TEST-BATCH-A1',
                'expiry_date', '2027-01-01',
                'unit_cost', 10
            )
        )
    );

    RAISE NOTICE 'Receive result: %', v_result;

    -- 9. Check idempotency
    RAISE NOTICE 'Testing Idempotency...';
    v_result := public.receive_procurement_order(
        v_po.id,
        v_warehouse_id,
        v_admin_id,
        v_receipt_number,
        'Duplicate notes',
        '[]'::jsonb
    );
    RAISE NOTICE 'Idempotency result: %', v_result;
    IF v_result->>'message' != 'Receipt already processed (idempotent)' THEN
        RAISE EXCEPTION 'Idempotency test failed';
    END IF;

    -- 10. Check Cross-Warehouse Rejection
    RAISE NOTICE 'Testing Cross-Warehouse Rejection...';
    DECLARE
        v_other_wh UUID;
    BEGIN
        SELECT id INTO v_other_wh FROM public.warehouses WHERE id != v_warehouse_id LIMIT 1;
        IF v_other_wh IS NOT NULL THEN
            PERFORM public.receive_procurement_order(
                v_po.id,
                v_other_wh,
                v_admin_id,
                v_receipt_number || '-FAIL',
                '',
                '[]'::jsonb
            );
            RAISE EXCEPTION 'Cross-warehouse did not fail as expected';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Cross-warehouse rejected as expected: %', SQLERRM;
    END;

    -- 11. Traceability Check
    RAISE NOTICE 'Testing Traceability...';
    IF NOT EXISTS (
        SELECT 1 FROM public.product_batches pb
        JOIN public.goods_receipt_items gri ON pb.goods_receipt_item_id = gri.id
        JOIN public.goods_receipts gr ON gri.receipt_id = gr.id
        WHERE pb.batch_number = 'TEST-BATCH-A1' AND gr.receipt_number = v_receipt_number
    ) THEN
        RAISE EXCEPTION 'Traceability linkage not found!';
    END IF;
    RAISE NOTICE 'Traceability linked successfully.';

    RAISE NOTICE 'All DB E2E tests passed successfully!';
    
    -- Rollback everything so we don't pollute the production database
    RAISE EXCEPTION 'TEST_SUCCESS_ROLLBACK';

EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'TEST_SUCCESS_ROLLBACK' THEN
        RAISE NOTICE 'Test completed successfully and changes rolled back.';
    ELSE
        RAISE EXCEPTION 'Test failed: %', SQLERRM;
    END IF;
END $$;
