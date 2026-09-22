-- Migration: 20260922000009_putaway_grn_fix.sql
-- Description: Fix the GRN missing stock row bug and safely reconcile orphaned staging stock.

-- Part 1: Replace blind UPDATE with safe UPSERT in process_grn
CREATE OR REPLACE FUNCTION public.receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID,
    p_receipt_number TEXT,
    p_notes TEXT,
    p_items JSONB -- [{ procurement_order_item_id, product_id, accepted_quantity, damaged_quantity, expired_quantity, batch_number, expiry_date, unit_cost, scanned_barcode }]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_user_role TEXT;
    v_user_warehouse UUID;
    v_active_shift RECORD;
    v_user_suspended BOOLEAN;
    v_item JSONB;
    v_po_item RECORD;
    v_product RECORD;
    v_receipt_id UUID;
    v_grn_item_id UUID;
    v_batch_id UUID;
    v_all_received BOOLEAN := TRUE;
    v_any_received BOOLEAN := FALSE;
    v_status TEXT;
    v_accepted INTEGER;
    v_damaged INTEGER;
    v_expired INTEGER;
    v_rejected INTEGER;
    v_line_total INTEGER;
BEGIN
    -- 1. Check idempotency
    SELECT id INTO v_receipt_id FROM public.goods_receipts WHERE receipt_number = p_receipt_number;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Receipt already processed (idempotent)', 'receipt_id', v_receipt_id);
    END IF;

    -- 2. Validate Caller
    SELECT role, warehouse_id, is_suspended INTO v_user_role, v_user_warehouse, v_user_suspended
    FROM public.profiles WHERE id = auth.uid(); -- Enforce lookup on true authenticated caller

    IF v_user_suspended = TRUE THEN RAISE EXCEPTION 'Unauthorized: Account is suspended'; END IF;
    IF v_user_role NOT IN ('admin', 'warehouse_manager', 'warehouse_staff') THEN RAISE EXCEPTION 'Unauthorized: Invalid role'; END IF;

    -- Strict Identity Hardening: Caller identity MUST match requested p_user_id unless they are an admin
    IF p_user_id != auth.uid() AND v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: p_user_id must match authenticated user identity';
    END IF;

    -- Staff Operational Requirements
    IF v_user_role = 'warehouse_staff' THEN
        SELECT * INTO v_active_shift FROM public.staff_shifts 
        WHERE staff_id = auth.uid() AND status = 'active';
        
        IF v_active_shift IS NULL OR v_active_shift.current_duty != 'inward_damage' THEN
            RAISE EXCEPTION 'Unauthorized: Valid active shift with inward_damage duty required for warehouse_staff';
        END IF;

        -- Strict Warehouse Hardening: Shift warehouse MUST match the requested PO warehouse
        IF v_active_shift.warehouse_id != p_warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Shift warehouse does not match PO warehouse';
        END IF;
    END IF;

    -- 3. Lock PO
    SELECT * INTO v_order FROM public.procurement_orders WHERE id = p_procurement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Procurement order not found'; END IF;
    IF v_order.status NOT IN ('approved', 'partially_received') THEN RAISE EXCEPTION 'Cannot receive a PO that is %', v_order.status; END IF;
    IF v_order.warehouse_id != p_warehouse_id THEN RAISE EXCEPTION 'Warehouse mismatch on PO'; END IF;

    -- 4. Cross-warehouse validation
    IF v_user_role != 'admin' AND v_user_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cross-warehouse receiving blocked';
    END IF;

    -- 5. Create GRN
    INSERT INTO public.goods_receipts (receipt_number, procurement_order_id, vendor_id, warehouse_id, received_by, notes)
    VALUES (p_receipt_number, p_procurement_id, v_order.vendor_id, p_warehouse_id, p_user_id, p_notes)
    RETURNING id INTO v_receipt_id;

    -- 6. Process items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Parse Quantities
        v_accepted := COALESCE((v_item->>'accepted_quantity')::INTEGER, 0);
        v_damaged := COALESCE((v_item->>'damaged_quantity')::INTEGER, 0);
        v_expired := COALESCE((v_item->>'expired_quantity')::INTEGER, 0);
        v_rejected := v_damaged + v_expired;
        
        -- Fallback for legacy clients sending rejected_quantity directly
        IF v_rejected = 0 AND (v_item->>'rejected_quantity') IS NOT NULL THEN
            v_rejected := (v_item->>'rejected_quantity')::INTEGER;
        END IF;

        v_line_total := v_accepted + v_damaged + v_expired;

        -- Lock PO Item Authoritatively
        SELECT * INTO v_po_item FROM public.procurement_order_items 
        WHERE id = (v_item->>'procurement_order_item_id')::UUID 
          AND procurement_order_id = p_procurement_id FOR UPDATE;
          
        IF NOT FOUND THEN RAISE EXCEPTION 'PO Item % not found', v_item->>'procurement_order_item_id'; END IF;

        -- Server-Authoritative Barcode Validation using the stable internal_barcode
        SELECT * INTO v_product FROM public.products WHERE id = v_po_item.product_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_po_item.product_id; END IF;

        IF v_product.internal_barcode IS NULL OR NOT (v_product.internal_barcode ~ '^FLH[0-9]{6}$') THEN
            RAISE EXCEPTION 'PRODUCT_HAS_NO_INTERNAL_BARCODE: Product % lacks valid internal barcode', v_product.name;
        END IF;

        IF (v_item->>'scanned_barcode') IS NULL OR (v_item->>'scanned_barcode') != v_product.internal_barcode THEN
            RAISE EXCEPTION 'BARCODE_MISMATCH: Scanned barcode does not match product %', v_product.name;
        END IF;

        -- Quantity Validation (AFTER ROW LOCK)
        IF v_accepted < 0 OR v_damaged < 0 OR v_expired < 0 THEN
            RAISE EXCEPTION 'Negative quantities not allowed for product %', v_product.name;
        END IF;

        IF v_line_total = 0 THEN
            CONTINUE; -- Skip empty lines
        END IF;

        IF v_po_item.received_quantity + v_line_total > v_po_item.quantity THEN
            RAISE EXCEPTION 'OVER_RECEIPT: Cannot receive % units. Only % remaining for product %', v_line_total, (v_po_item.quantity - v_po_item.received_quantity), v_product.name;
        END IF;

        v_any_received := TRUE;

        -- Create GRN Item
        INSERT INTO public.goods_receipt_items (
            receipt_id, procurement_order_item_id, product_id, 
            quantity_received, accepted_quantity, rejected_quantity,
            damaged_quantity, expired_quantity, 
            unit_cost, batch_number, expiry_date
        ) VALUES (
            v_receipt_id, v_po_item.id, v_po_item.product_id,
            v_line_total, v_accepted, v_rejected,
            v_damaged, v_expired,
            (v_item->>'unit_cost')::NUMERIC, v_item->>'batch_number', (v_item->>'expiry_date')::DATE
        ) RETURNING id INTO v_grn_item_id;

        -- Update PO item (recevied_quantity includes accepted and rejected)
        UPDATE public.procurement_order_items
        SET received_quantity = received_quantity + v_line_total
        WHERE id = v_po_item.id;

        -- Accepted stock accounting: STAGING ISOLATION
        IF v_accepted > 0 THEN
            -- 1. Create product batch isolating stock in staging_quantity
            INSERT INTO public.product_batches (
                product_id, warehouse_id, batch_number, expiry_date, 
                received_quantity, available_quantity, staging_quantity, status, goods_receipt_item_id
            ) VALUES (
                v_po_item.product_id, p_warehouse_id, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
                v_accepted, 0, v_accepted, 'active', v_grn_item_id
            ) RETURNING id INTO v_batch_id;

            -- 2. Safely UPSERT warehouse_stock.staging_quantity (DO NOT TOUCH sellable quantity)
            INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity, staging_quantity)
            VALUES (p_warehouse_id, v_po_item.product_id, 0, v_accepted)
            ON CONFLICT (warehouse_id, product_id) DO UPDATE 
            SET staging_quantity = public.warehouse_stock.staging_quantity + EXCLUDED.staging_quantity;

            -- 3. Write stock ledger with grn_staging reason
            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
            ) VALUES (
                p_warehouse_id, v_po_item.product_id, v_batch_id, v_accepted, 'grn_staging', p_user_id
            );
            
            -- Add to putaway tasks
            INSERT INTO public.putaway_tasks (warehouse_id, product_id, batch_id, quantity, placed_quantity, source_type)
            VALUES (p_warehouse_id, v_po_item.product_id, v_batch_id, v_accepted, 0, 'grn');
        END IF;
    END LOOP;

    IF NOT v_any_received THEN
        RAISE EXCEPTION 'No valid items received';
    END IF;

    -- Evaluate PO Status
    SELECT bool_and(received_quantity >= quantity) INTO v_all_received
    FROM public.procurement_order_items WHERE procurement_order_id = p_procurement_id;

    IF v_all_received THEN
        v_status := 'received';
    ELSE
        v_status := 'partially_received';
    END IF;

    UPDATE public.procurement_orders SET status = v_status WHERE id = p_procurement_id;

    RETURN jsonb_build_object('success', true, 'receipt_id', v_receipt_id, 'status', v_status);
END;
$$;

-- Part 2: Safely reconcile the missing staging stock exactly as requested
DO $$ 
DECLARE
    v_warehouse_id UUID;
    v_product_id UUID;
    v_missing_staging INTEGER;
    v_task_count INTEGER;
BEGIN
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE name ILIKE '%Udupi%';
    SELECT id INTO v_product_id FROM public.products WHERE internal_barcode = 'FLH100242';

    IF v_warehouse_id IS NOT NULL AND v_product_id IS NOT NULL THEN
        -- Verify that the 10 units are actually missing in warehouse_stock
        IF NOT EXISTS (
            SELECT 1 FROM public.warehouse_stock 
            WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id
        ) THEN
            -- Calculate the exact orphaned staging_quantity strictly from product_batches
            -- This adheres to the authoritative GRN receiving state
            SELECT COALESCE(SUM(staging_quantity), 0) INTO v_missing_staging
            FROM public.product_batches
            WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;

            -- Also verify there is a pending putaway task for this
            SELECT COUNT(*) INTO v_task_count
            FROM public.putaway_tasks
            WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id 
              AND status IN ('pending', 'in_progress', 'assigned');

            IF v_missing_staging > 0 AND v_task_count > 0 THEN
                -- Safely insert the orphaned staging_quantity.
                -- Sellable 'quantity' remains 0. Idempotent by ON CONFLICT DO NOTHING (or safe UPDATE).
                INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity, staging_quantity)
                VALUES (v_warehouse_id, v_product_id, 0, v_missing_staging)
                ON CONFLICT (warehouse_id, product_id) DO UPDATE 
                SET staging_quantity = EXCLUDED.staging_quantity
                -- Extra safety: only apply if the existing row is somehow 0
                WHERE public.warehouse_stock.staging_quantity = 0;
            END IF;
        END IF;
    END IF;
END $$;
