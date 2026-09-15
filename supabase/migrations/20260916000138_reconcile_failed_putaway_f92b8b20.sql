-- Migration 134: Safely reconcile the failed partial Putaway transaction f92b8b20-e37c-41f9-9c68-c44f1bc3c768

DO $$
DECLARE
    v_task_id UUID := 'f92b8b20-e37c-41f9-9c68-c44f1bc3c768';
    v_batch_id UUID := '475ec884-8050-4c70-bc54-7b87ab7934b6';
    v_product_id UUID := '44c85d6c-e21e-4c08-9328-13d699e66f12';
    v_warehouse_id UUID := '9f4d3149-f3e4-432b-98b6-f17af77c9c33'; -- Udupi
    v_location_id UUID := '9501ed73-4570-4c0b-bbda-d5e6d4339631'; -- D0-CR01-001-01-B at Udupi
    
    v_task RECORD;
    v_batch RECORD;
    v_stock RECORD;
    v_placement RECORD;
BEGIN
    -- 1. Lock and Verify Task Fingerprint
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = v_task_id FOR UPDATE;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'FINGERPRINT_MISMATCH: Task not found';
    END IF;
    
    -- Idempotency check: if already reconciled, do nothing.
    IF v_task.placed_quantity = 20 THEN
        RAISE NOTICE 'ALREADY_RECONCILED: Task placed_quantity is already 20. Skipping reconciliation.';
        RETURN;
    END IF;

    -- Strict fingerprint guards
    IF v_task.product_id != v_product_id THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.product_id'; END IF;
    IF v_task.batch_id != v_batch_id THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.batch_id'; END IF;
    IF v_task.warehouse_id != v_warehouse_id THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.warehouse_id'; END IF;
    IF v_task.quantity != 20 THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.quantity != 20'; END IF;
    IF v_task.placed_quantity != 0 THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.placed_quantity != 0'; END IF;
    IF v_task.status != 'completed' THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: task.status != completed'; END IF;

    -- 2. Verify placement physical existence
    -- The failed transaction created a physical placement of 20 without ledger updates.
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = v_location_id AND product_id = v_product_id AND warehouse_id = v_warehouse_id;

    IF v_placement IS NULL THEN
        RAISE EXCEPTION 'FINGERPRINT_MISMATCH: Expected placement row not found';
    END IF;

    IF v_placement.quantity < 20 THEN
        RAISE EXCEPTION 'FINGERPRINT_MISMATCH: Placement quantity < 20';
    END IF;

    -- 3. Lock and Verify Batch Staging
    SELECT * INTO v_batch FROM public.product_batches WHERE id = v_batch_id FOR UPDATE;
    IF v_batch IS NULL THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: Batch not found'; END IF;
    IF v_batch.product_id != v_product_id THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: batch.product_id'; END IF;
    IF v_batch.staging_quantity < 20 THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: batch.staging_quantity < 20'; END IF;

    -- 4. Lock and Verify Stock Staging
    SELECT * INTO v_stock FROM public.warehouse_stock 
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: Stock not found'; END IF;
    IF v_stock.staging_quantity < 20 THEN RAISE EXCEPTION 'FINGERPRINT_MISMATCH: stock.staging_quantity < 20'; END IF;

    -- All guards passed. Proceed with exact missing accounting.
    -- DO NOT alter physical placement (it's already 20+).
    
    -- warehouse_stock
    UPDATE public.warehouse_stock
    SET staging_quantity = staging_quantity - 20,
        quantity = quantity + 20
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

    -- product_batches
    UPDATE public.product_batches
    SET staging_quantity = staging_quantity - 20,
        available_quantity = available_quantity + 20
    WHERE id = v_batch_id;

    -- putaway_tasks
    UPDATE public.putaway_tasks
    SET placed_quantity = 20
    WHERE id = v_task_id;

    RAISE NOTICE 'RECONCILIATION_SUCCESS: Missing accounting applied for Task f92b8b20-e37c-41f9-9c68-c44f1bc3c768';
END;
$$;
