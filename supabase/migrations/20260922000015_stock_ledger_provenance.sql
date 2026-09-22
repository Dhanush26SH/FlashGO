-- Migration: 20260922000015_stock_ledger_provenance.sql
-- Description: Add reference_type to stock_ledgers for provenance tracking and update RPCs

-- 1. Add generic provenance to stock_ledgers
ALTER TABLE public.stock_ledgers ADD COLUMN IF NOT EXISTS reference_type TEXT;

-- 2. Update remove_expired_batch_inventory
CREATE OR REPLACE FUNCTION public.remove_expired_batch_inventory(
    p_location_id UUID,
    p_batch_id UUID,
    p_removed_qty INTEGER,
    p_scanned_barcode TEXT,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_shift RECORD;
    v_batch RECORD;
    v_product RECORD;
    v_placement RECORD;
    v_warehouse_id UUID;
BEGIN
    IF p_removed_qty <= 0 THEN
        RAISE EXCEPTION 'Removed quantity must be greater than zero.';
    END IF;

    -- 1. Validate Authenticated Staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id AND is_suspended = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or suspended.';
    END IF;
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Only warehouse staff can perform expiry duties.';
    END IF;
    v_warehouse_id := v_profile.warehouse_id;

    -- 2. Validate Active Shift and Duty
    SELECT * INTO v_shift FROM public.staff_shifts 
    WHERE staff_id = p_user_id AND status = 'active' AND current_duty = 'damage_expiry';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: You must have an active shift with Expiry (damage_expiry) duty.';
    END IF;

    -- 3. Validate Batch
    SELECT * INTO v_batch FROM public.product_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found.';
    END IF;
    IF v_batch.warehouse_id != v_warehouse_id THEN
        RAISE EXCEPTION 'Batch does not belong to your warehouse.';
    END IF;
    IF v_batch.status = 'depleted' THEN
        RAISE EXCEPTION 'Batch is already depleted.';
    END IF;
    IF v_batch.expiry_date >= CURRENT_DATE THEN
        RAISE EXCEPTION 'Batch is not expired yet. Only expired batches can be removed via this workflow.';
    END IF;

    -- 4. Validate Product and Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_batch.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    IF v_product.internal_barcode != p_scanned_barcode AND v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'Barcode mismatch: Scanned barcode does not match the product.';
    END IF;

    -- 5. Validate and decrement Placement (Current Architecture)
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id AND warehouse_id = v_warehouse_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is not located at this placement.';
    END IF;
    IF v_placement.quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than physically exists at this location (found: %, requested: %).', v_placement.quantity, p_removed_qty;
    END IF;

    IF v_batch.available_quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than available in the batch (available: %, requested: %).', v_batch.available_quantity, p_removed_qty;
    END IF;

    -- 6. Perform the removals
    -- Decrement Placement
    UPDATE public.warehouse_product_placements 
    SET quantity = quantity - p_removed_qty 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id;

    -- Decrement Batch
    UPDATE public.product_batches 
    SET available_quantity = available_quantity - p_removed_qty,
        status = CASE WHEN available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE status END
    WHERE id = p_batch_id;

    -- Decrement global warehouse stock
    PERFORM 1 FROM public.warehouse_stock WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id FOR UPDATE;
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_removed_qty
    WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id;

    -- 7. Ledger Movement
    INSERT INTO public.stock_ledgers (
        warehouse_id, 
        product_id, 
        batch_id, 
        quantity_change, 
        reason, 
        performed_by,
        reference_type
    ) VALUES (
        v_warehouse_id, 
        v_batch.product_id, 
        p_batch_id, 
        -(p_removed_qty), 
        'expired', 
        p_user_id,
        'expiry_workflow'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'removed_quantity', p_removed_qty, 
        'remaining_batch_quantity', v_batch.available_quantity - p_removed_qty,
        'batch_status', CASE WHEN v_batch.available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE v_batch.status END
    );
END;
$$;


-- 3. Update remove_fnv_batch_inventory
CREATE OR REPLACE FUNCTION public.remove_fnv_batch_inventory(
    p_location_id UUID,
    p_batch_id UUID,
    p_removed_qty INTEGER,
    p_scanned_barcode TEXT,
    p_reason TEXT,
    p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_shift RECORD;
    v_batch RECORD;
    v_product RECORD;
    v_placement RECORD;
    v_warehouse_id UUID;
    v_fnv_category_id UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 1. Validate Reason Whitelist
    IF p_reason NOT IN ('spoiled', 'damaged', 'quality_issue') THEN
        RAISE EXCEPTION 'Invalid reason. Must be spoiled, damaged, or quality_issue.';
    END IF;

    -- 2. Validate Quantity
    IF p_removed_qty <= 0 THEN
        RAISE EXCEPTION 'Removed quantity must be greater than zero.';
    END IF;

    -- 3. Validate Authenticated Staff
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id AND is_suspended = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or suspended.';
    END IF;
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Only warehouse staff can perform F&V duties.';
    END IF;
    v_warehouse_id := v_profile.warehouse_id;

    -- 4. Validate Active Shift and Duty
    SELECT * INTO v_shift FROM public.staff_shifts 
    WHERE staff_id = p_user_id AND status = 'active' AND current_duty = 'fnv';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: You must have an active shift with F&V (fnv) duty.';
    END IF;

    -- 5. Validate Batch
    SELECT * INTO v_batch FROM public.product_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found.';
    END IF;
    IF v_batch.warehouse_id != v_warehouse_id THEN
        RAISE EXCEPTION 'Batch does not belong to your warehouse.';
    END IF;
    IF v_batch.status = 'depleted' THEN
        RAISE EXCEPTION 'Batch is already depleted.';
    END IF;

    -- 6. Validate Product, Category, and Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_batch.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found.';
    END IF;
    IF v_product.category_id != v_fnv_category_id THEN
        RAISE EXCEPTION 'Unauthorized: Product does not belong to the Vegetables & Fruits category.';
    END IF;
    IF v_product.internal_barcode != p_scanned_barcode AND v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'Barcode mismatch: Scanned barcode does not match the product.';
    END IF;

    -- 7. Validate and decrement Placement (Current Architecture)
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id AND warehouse_id = v_warehouse_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is not located at this placement.';
    END IF;
    IF v_placement.quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than physically exists at this location (found: %, requested: %).', v_placement.quantity, p_removed_qty;
    END IF;

    IF v_batch.available_quantity < p_removed_qty THEN
        RAISE EXCEPTION 'Cannot remove more quantity than available in the batch (available: %, requested: %).', v_batch.available_quantity, p_removed_qty;
    END IF;

    -- 8. Perform the removals
    -- Decrement Placement
    UPDATE public.warehouse_product_placements 
    SET quantity = quantity - p_removed_qty 
    WHERE location_id = p_location_id AND product_id = v_batch.product_id;

    -- Decrement Batch and accumulate damaged quantity semantics if they exist
    UPDATE public.product_batches 
    SET available_quantity = available_quantity - p_removed_qty,
        damaged_quantity = damaged_quantity + p_removed_qty,
        status = CASE WHEN available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE status END
    WHERE id = p_batch_id;

    -- Decrement global warehouse stock
    PERFORM 1 FROM public.warehouse_stock WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id FOR UPDATE;
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_removed_qty
    WHERE warehouse_id = v_warehouse_id AND product_id = v_batch.product_id;

    -- 9. Ledger Movement
    INSERT INTO public.stock_ledgers (
        warehouse_id, 
        product_id, 
        batch_id, 
        quantity_change, 
        reason, 
        performed_by,
        reference_type
    ) VALUES (
        v_warehouse_id, 
        v_batch.product_id, 
        p_batch_id, 
        -(p_removed_qty), 
        p_reason, 
        p_user_id,
        'fnv_workflow'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'removed_quantity', p_removed_qty, 
        'reason', p_reason,
        'remaining_batch_quantity', v_batch.available_quantity - p_removed_qty,
        'batch_status', CASE WHEN v_batch.available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE v_batch.status END
    );
END;
$$;


-- 4. Update manual adjustment RPC
CREATE OR REPLACE FUNCTION public.adjust_batch_stock(
    p_batch_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_is_suspended BOOLEAN;
    v_role TEXT;
    v_user_warehouse UUID;
    v_warehouse_id UUID;
    v_product_id UUID;
    v_batch_avail INTEGER;
    v_warehouse_qty INTEGER;
    v_reserved_qty INTEGER;
BEGIN
    -- 1. Validate caller identity and permissions
    SELECT role, warehouse_id, is_suspended 
    INTO v_role, v_user_warehouse, v_is_suspended
    FROM public.profiles 
    WHERE id = p_user_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Account is suspended';
    END IF;

    IF v_role NOT IN ('admin', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized: Only active admins or warehouse staff can adjust stock';
    END IF;

    -- 2. Validate reason constraint
    IF p_reason NOT IN ('damaged', 'expired', 'lost', 'correction') THEN
        RAISE EXCEPTION 'Invalid adjustment reason. Must be damaged, expired, lost, or correction.';
    END IF;

    -- 3. Lock batch and get details
    SELECT warehouse_id, product_id, available_quantity 
    INTO v_warehouse_id, v_product_id, v_batch_avail
    FROM public.product_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    -- 4. Authorize warehouse assignment for warehouse_staff
    IF v_role = 'warehouse_staff' AND v_user_warehouse != v_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot adjust stock in unassigned warehouses';
    END IF;

    -- 5. Lock warehouse stock
    SELECT quantity INTO v_warehouse_qty
    FROM public.warehouse_stock
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id
    FOR UPDATE;

    -- 6. Validate physical limits
    IF v_batch_avail + p_quantity_change < 0 THEN
        RAISE EXCEPTION 'Adjustment exceeds available batch quantity (Available: %, Requested: %)', v_batch_avail, ABS(p_quantity_change);
    END IF;

    IF v_warehouse_qty + p_quantity_change < 0 THEN
        RAISE EXCEPTION 'Adjustment exceeds aggregate warehouse quantity';
    END IF;

    -- 7. Validate reservation integrity (only if decrementing)
    IF p_quantity_change < 0 THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_qty
        FROM public.inventory_reservations
        WHERE warehouse_id = v_warehouse_id 
          AND product_id = v_product_id 
          AND status = 'reserved';

        IF (v_warehouse_qty + p_quantity_change) < v_reserved_qty THEN
            RAISE EXCEPTION 'Cannot adjust stock below active reservations (Reserved: %, Requested Remaining: %)', v_reserved_qty, (v_warehouse_qty + p_quantity_change);
        END IF;
    END IF;

    -- 8. Apply changes
    UPDATE public.product_batches
    SET available_quantity = available_quantity + p_quantity_change,
        status = CASE 
            WHEN available_quantity + p_quantity_change = 0 THEN 'depleted'
            ELSE status
        END
    WHERE id = p_batch_id;

    UPDATE public.warehouse_stock
    SET quantity = quantity + p_quantity_change
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;

    -- 9. Insert Ledger
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by, reference_type
    ) VALUES (
        v_warehouse_id, v_product_id, p_batch_id, p_quantity_change, p_reason, p_user_id, 'manual_adjustment'
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Update admin_get_warehouse_staff_work_history
CREATE OR REPLACE FUNCTION public.admin_get_warehouse_staff_work_history(
    p_warehouse_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_worker_id UUID DEFAULT NULL,
    p_duty TEXT DEFAULT 'All Duties'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_summary JSONB;
    v_details JSONB;
BEGIN
    IF get_my_role() != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Calculate summary separately for simplicity
    SELECT jsonb_build_object(
        'staff_worked', count(DISTINCT s.staff_id),
        'active_minutes', COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(s.completed_at, LEAST(now(), s.shift_end)) - s.started_at))/60), 0)
    ) INTO v_summary
    FROM staff_shifts s
    WHERE s.warehouse_id = p_warehouse_id
      AND s.started_at >= p_start_date
      AND s.started_at <= p_end_date
      AND (p_worker_id IS NULL OR s.staff_id = p_worker_id)
      AND (SELECT role FROM profiles WHERE id = s.staff_id) = 'warehouse_staff'
      AND s.staff_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true));

    -- Events Query
    WITH events AS (
        -- Putaway
        SELECT 
            'Putaway' AS duty,
            pt.id AS task_id,
            pt.worker_id AS staff_id,
            p.full_name AS worker_name,
            pt.completed_at AS timestamp,
            jsonb_build_object(
                'product_name', pr.name,
                'assigned_qty', pt.quantity,
                'placed_qty', pt.placed_quantity,
                'location', pt.destination_location,
                'status', pt.status
            ) AS details
        FROM putaway_tasks pt
        JOIN profiles p ON p.id = pt.worker_id
        JOIN products pr ON pr.id = pt.product_id
        WHERE pt.warehouse_id = p_warehouse_id
          AND pt.completed_at >= p_start_date
          AND pt.completed_at <= p_end_date
          AND (p_worker_id IS NULL OR pt.worker_id = p_worker_id)
          AND (p_duty = 'All Duties' OR p_duty = 'Putaway')
          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)
          
        UNION ALL
        
        -- Auditor
        SELECT 
            'Auditor' AS duty,
            cc.id AS task_id,
            cc.counter_id AS staff_id,
            p.full_name AS worker_name,
            cc.submitted_at AS timestamp,
            jsonb_build_object(
                'product_name', pr.name,
                'location', wl.location_code,
                'system_qty', cc.system_quantity,
                'physical_qty', cc.counted_quantity,
                'variance', cc.variance,
                'status', cc.status
            ) AS details
        FROM cycle_counts cc
        JOIN profiles p ON p.id = cc.counter_id
        JOIN products pr ON pr.id = cc.product_id
        LEFT JOIN warehouse_locations wl ON wl.id = cc.location_id
        WHERE cc.warehouse_id = p_warehouse_id
          AND cc.submitted_at >= p_start_date
          AND cc.submitted_at <= p_end_date
          AND (p_worker_id IS NULL OR cc.counter_id = p_worker_id)
          AND (p_duty = 'All Duties' OR p_duty = 'Auditor')
          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)
          
        UNION ALL
        
        -- Inward
        SELECT 
            'Inward + Damage' AS duty,
            gr.id AS task_id,
            gr.received_by AS staff_id,
            p.full_name AS worker_name,
            gr.created_at AS timestamp,
            jsonb_build_object(
                'receipt_number', gr.receipt_number,
                'items', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'product_name', pr2.name,
                            'accepted_qty', gri.accepted_quantity,
                            'damaged_qty', gri.damaged_quantity,
                            'expired_qty', gri.expired_quantity
                        )
                    )
                    FROM goods_receipt_items gri
                    JOIN products pr2 ON pr2.id = gri.product_id
                    WHERE gri.receipt_id = gr.id
                )
            ) AS details
        FROM goods_receipts gr
        JOIN profiles p ON p.id = gr.received_by
        WHERE gr.warehouse_id = p_warehouse_id
          AND gr.created_at >= p_start_date
          AND gr.created_at <= p_end_date
          AND (p_worker_id IS NULL OR gr.received_by = p_worker_id)
          AND (p_duty = 'All Duties' OR p_duty = 'Inward + Damage')
          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)
          
        UNION ALL
        
        -- Expiry
        SELECT 
            'Expiry' AS duty,
            sl.id AS task_id,
            sl.performed_by AS staff_id,
            p.full_name AS worker_name,
            sl.created_at AS timestamp,
            jsonb_build_object(
                'product_name', pr.name,
                'batch', pb.batch_number,
                'removed_qty', ABS(sl.quantity_change),
                'reason', 'Expired'
            ) AS details
        FROM stock_ledgers sl
        JOIN profiles p ON p.id = sl.performed_by
        JOIN products pr ON pr.id = sl.product_id
        LEFT JOIN product_batches pb ON pb.id = sl.batch_id
        WHERE sl.warehouse_id = p_warehouse_id
          AND sl.created_at >= p_start_date
          AND sl.created_at <= p_end_date
          AND (p_worker_id IS NULL OR sl.performed_by = p_worker_id)
          AND (p_duty = 'All Duties' OR p_duty = 'Expiry')
          AND sl.reason = 'expired'
          AND sl.reference_type = 'expiry_workflow'
          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)
          
        UNION ALL
        
        -- F&V
        SELECT 
            'F&V' AS duty,
            sl.id AS task_id,
            sl.performed_by AS staff_id,
            p.full_name AS worker_name,
            sl.created_at AS timestamp,
            jsonb_build_object(
                'product_name', pr.name,
                'batch', pb.batch_number,
                'removed_qty', ABS(sl.quantity_change),
                'reason', CASE 
                    WHEN sl.reason = 'spoiled' THEN 'Rotten / Spoiled'
                    WHEN sl.reason = 'damaged' THEN 'Damaged / Bruised'
                    WHEN sl.reason = 'quality_issue' THEN 'Poor Quality / Unfit for Sale'
                    ELSE sl.reason
                END
            ) AS details
        FROM stock_ledgers sl
        JOIN profiles p ON p.id = sl.performed_by
        JOIN products pr ON pr.id = sl.product_id
        LEFT JOIN product_batches pb ON pb.id = sl.batch_id
        WHERE sl.warehouse_id = p_warehouse_id
          AND sl.created_at >= p_start_date
          AND sl.created_at <= p_end_date
          AND (p_worker_id IS NULL OR sl.performed_by = p_worker_id)
          AND (p_duty = 'All Duties' OR p_duty = 'F&V')
          AND sl.reason IN ('spoiled', 'damaged', 'quality_issue')
          AND sl.reference_type = 'fnv_workflow'
          AND p.email NOT IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true)
    )
    SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.timestamp DESC), '[]'::jsonb) INTO v_details
    FROM events e;

    -- Add some aggregated summary data for duties
    v_summary = v_summary || jsonb_build_object(
        'putaway_units', (
            SELECT COALESCE(sum(placed_quantity), 0) FROM putaway_tasks 
            WHERE warehouse_id = p_warehouse_id AND completed_at >= p_start_date AND completed_at <= p_end_date AND (p_worker_id IS NULL OR worker_id = p_worker_id) AND worker_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))
        ),
        'audits_completed', (
            SELECT count(id) FROM cycle_counts 
            WHERE warehouse_id = p_warehouse_id AND submitted_at >= p_start_date AND submitted_at <= p_end_date AND status = 'submitted' AND (p_worker_id IS NULL OR counter_id = p_worker_id) AND counter_id NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))
        ),
        'inward_units_processed', (
            SELECT COALESCE(sum(gri.accepted_quantity + gri.damaged_quantity + gri.expired_quantity), 0) 
            FROM goods_receipt_items gri 
            JOIN goods_receipts gr ON gr.id = gri.receipt_id 
            WHERE gr.warehouse_id = p_warehouse_id AND gr.created_at >= p_start_date AND gr.created_at <= p_end_date AND (p_worker_id IS NULL OR gr.received_by = p_worker_id) AND gr.received_by NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))
        ),
        'expiry_units_removed', (
            SELECT COALESCE(sum(ABS(quantity_change)), 0) FROM stock_ledgers
            WHERE warehouse_id = p_warehouse_id AND created_at >= p_start_date AND created_at <= p_end_date AND reason = 'expired' AND reference_type = 'expiry_workflow' AND (p_worker_id IS NULL OR performed_by = p_worker_id) AND performed_by NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))
        ),
        'fnv_units_removed', (
            SELECT COALESCE(sum(ABS(quantity_change)), 0) FROM stock_ledgers
            WHERE warehouse_id = p_warehouse_id AND created_at >= p_start_date AND created_at <= p_end_date AND reason IN ('spoiled', 'damaged', 'quality_issue') AND reference_type = 'fnv_workflow' AND (p_worker_id IS NULL OR performed_by = p_worker_id) AND performed_by NOT IN (SELECT id FROM profiles WHERE email IN (SELECT email FROM dev_test_accounts WHERE is_e2e_test_account = true))
        )
    );

    RETURN jsonb_build_object('summary', v_summary, 'details', v_details);
END;
$$;
