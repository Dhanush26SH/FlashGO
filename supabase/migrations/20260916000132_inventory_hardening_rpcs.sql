-- Migration: 20260916000132_inventory_hardening_rpcs.sql
-- Description: Phase 3 (Partial Putaway), Phase 4 (Picker Hardening), Phase 5-6 (Cancellation Hardening), Phase 7 (Cycle Count Hardening)

-- ==========================================
-- PHASE 3: PARTIAL PUTAWAY
-- ==========================================

DROP FUNCTION IF EXISTS public.warehouse_putaway_complete(UUID, TEXT);
DROP FUNCTION IF EXISTS public.warehouse_putaway_complete(UUID, TEXT, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_barcode TEXT,
    p_location_id UUID,
    p_quantity INTEGER
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_task RECORD;
    v_product RECORD;
    v_location RECORD;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;

    -- Validate worker and state
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL OR v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Invalid shift or duty state';
    END IF;

    -- Lock and load task
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'Task is not in_progress by you';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;
    
    IF v_task.quantity - v_task.placed_quantity < p_quantity THEN
        RAISE EXCEPTION 'Cannot place more than remaining task quantity';
    END IF;

    -- Verify product barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- Resolve destination location
    SELECT * INTO v_location FROM public.warehouse_locations 
    WHERE id = p_location_id AND warehouse_id = v_task.warehouse_id;
    
    IF v_location IS NULL THEN
        RAISE EXCEPTION 'Invalid destination location';
    END IF;
    
    -- Verify staging stock bounds (using row locks)
    -- warehouse_stock
    PERFORM id FROM public.warehouse_stock 
    WHERE product_id = v_task.product_id AND warehouse_id = v_task.warehouse_id AND staging_quantity >= p_quantity FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient warehouse staging stock for putaway';
    END IF;
    
    -- product_batches
    PERFORM id FROM public.product_batches 
    WHERE id = v_task.batch_id AND staging_quantity >= p_quantity FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient batch staging stock for putaway';
    END IF;

    -- Atomically transfer staging -> placed/available
    UPDATE public.warehouse_stock
    SET staging_quantity = staging_quantity - p_quantity,
        quantity = quantity + p_quantity
    WHERE product_id = v_task.product_id AND warehouse_id = v_task.warehouse_id;

    UPDATE public.product_batches
    SET staging_quantity = staging_quantity - p_quantity,
        available_quantity = available_quantity + p_quantity
    WHERE id = v_task.batch_id;

    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_location.id, v_task.product_id, p_quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    -- Update Task Progress
    UPDATE public.putaway_tasks
    SET placed_quantity = placed_quantity + p_quantity
    WHERE id = p_task_id;
    
    IF v_task.placed_quantity + p_quantity >= v_task.quantity THEN
        UPDATE public.putaway_tasks
        SET status = 'completed', completed_at = now()
        WHERE id = p_task_id;
    END IF;

    -- Audit log
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
    ) VALUES (
        v_task.warehouse_id, v_task.product_id, v_task.batch_id, p_quantity, 'putaway_activation', auth.uid()
    );

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id, 'placed_quantity', p_quantity, 'remaining', v_task.quantity - (v_task.placed_quantity + p_quantity));
END;
$$;


-- ==========================================
-- PHASE 4: PICKER HARDENING
-- ==========================================

CREATE OR REPLACE FUNCTION public.pick_fefo_location_item(
    p_order_id UUID,
    p_product_id UUID,
    p_location_id UUID,
    p_user_id UUID,
    p_barcode TEXT
) RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_po_item RECORD;
    v_product RECORD;
    v_placement RECORD;
BEGIN
    IF p_location_id IS NULL THEN
        RAISE EXCEPTION 'Cannot pick unplaced inventory. Valid location required.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'picking' THEN RAISE EXCEPTION 'Order not in picking state'; END IF;

    SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    IF p_barcode != v_product.barcode THEN
        RAISE EXCEPTION 'Barcode mismatch: % != %', p_barcode, v_product.barcode;
    END IF;

    -- Lock and check placement
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE location_id = p_location_id AND product_id = p_product_id FOR UPDATE;

    IF NOT FOUND OR v_placement.quantity <= 0 THEN
        RAISE EXCEPTION 'Insufficient stock at specified location';
    END IF;

    -- Decrement location stock
    UPDATE public.warehouse_product_placements 
    SET quantity = quantity - 1 
    WHERE location_id = p_location_id AND product_id = p_product_id;

    -- Call original pick_fefo_item to handle the batch logic (which only consumes available_quantity)
    -- pick_fefo_item already handles stock_ledgers, warehouse_stock.quantity, product_batches.available_quantity, and picking_progress
    PERFORM public.pick_fefo_item(p_order_id, p_product_id, p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$;


-- ==========================================
-- PHASE 5 & 6: CANCELLATION & UNPACK HARDENING
-- ==========================================

-- Redefine process_order_cancellation to NEVER auto-restore physically picked goods to warehouse_stock without a location.
CREATE OR REPLACE FUNCTION process_order_cancellation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ledger RECORD;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        IF OLD.status = 'delivered' THEN
            RAISE EXCEPTION 'Cannot cancel a delivered order. Use return/refund workflow instead.';
        END IF;

        IF OLD.status IN ('handed_off', 'out_for_delivery') THEN
            NULL;
        ELSIF OLD.status IN ('placed', 'picking') THEN
            PERFORM release_order_reservations(NEW.id);
        END IF;
        
        -- Any order that started picking goes to the unpack queue to be physically returned to a shelf
        IF OLD.status IN ('picking', 'waiting_for_packing', 'packing', 'packed', 'staged') THEN
            -- Check if any physical picking occurred
            PERFORM 1 FROM public.stock_ledgers WHERE order_id = NEW.id AND reason IN ('picking', 'picking_undo');
            IF FOUND THEN
                INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status)
                VALUES (NEW.id, NEW.warehouse_id, 'pending');
            END IF;
        END IF;

        IF OLD.payment_status = 'paid' THEN
            NEW.payment_status := 'refunded';
            IF OLD.payment_method = 'wallet' THEN
                UPDATE public.profiles SET wallet_balance = wallet_balance + OLD.total_amount WHERE id = OLD.customer_id;
                INSERT INTO public.wallet_transactions (user_id, amount, type, description)
                VALUES (OLD.customer_id, OLD.total_amount, 'credit', 'Refund for Order ' || OLD.id);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Redefine process_order_unpack to require a location when restocking
DROP FUNCTION IF EXISTS public.process_order_unpack(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION process_order_unpack(
    p_unpack_id UUID,
    p_disposition TEXT, -- 'restocked', 'damaged', 'quarantine'
    p_user_id UUID,
    p_location_id UUID DEFAULT NULL -- ONLY required if restocked
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_unpack RECORD;
    v_ledger RECORD;
BEGIN
    SELECT * INTO v_unpack FROM public.order_unpack_queue WHERE id = p_unpack_id FOR UPDATE;
    IF v_unpack IS NULL THEN RAISE EXCEPTION 'Queue item not found'; END IF;
    IF v_unpack.status != 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

    IF p_disposition NOT IN ('restocked', 'damaged', 'quarantine') THEN
        RAISE EXCEPTION 'Invalid disposition: %', p_disposition;
    END IF;
    
    IF p_disposition = 'restocked' AND p_location_id IS NULL THEN
        RAISE EXCEPTION 'Restocking requires a valid location_id';
    END IF;

    UPDATE public.order_unpack_queue 
    SET status = p_disposition, processed_at = now(), processed_by = p_user_id
    WHERE id = p_unpack_id;

    IF p_disposition = 'restocked' THEN
        FOR v_ledger IN 
            SELECT product_id, order_item_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
            FROM public.stock_ledgers
            WHERE order_id = v_unpack.order_id AND reason IN ('picking', 'picking_undo')
            GROUP BY product_id, order_item_id, batch_id, warehouse_id
            HAVING SUM(quantity_change) < 0
        LOOP
            IF v_ledger.batch_id IS NOT NULL THEN
                UPDATE public.product_batches 
                SET available_quantity = available_quantity + ABS(v_ledger.net_picked)
                WHERE id = v_ledger.batch_id;
            END IF;

            UPDATE public.warehouse_stock 
            SET quantity = quantity + ABS(v_ledger.net_picked)
            WHERE warehouse_id = v_ledger.warehouse_id AND product_id = v_ledger.product_id;
            
            -- MUST UPDATE PLACEMENT FOR SELLABLE INTEGRITY
            INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
            VALUES (v_ledger.warehouse_id, p_location_id, v_ledger.product_id, ABS(v_ledger.net_picked), 'restock')
            ON CONFLICT (location_id, product_id) 
            DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
            )
            VALUES (
                v_ledger.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                ABS(v_ledger.net_picked), 'unpack_restock', v_unpack.order_id
            );
        END LOOP;
    ELSE
        FOR v_ledger IN 
            SELECT product_id, order_item_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
            FROM public.stock_ledgers
            WHERE order_id = v_unpack.order_id AND reason IN ('picking', 'picking_undo')
            GROUP BY product_id, order_item_id, batch_id, warehouse_id
            HAVING SUM(quantity_change) < 0
        LOOP
            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
            )
            VALUES (
                v_ledger.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                0, 'unpack_' || p_disposition, v_unpack.order_id
            );
        END LOOP;
    END IF;

    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details)
    VALUES (p_user_id, 'return_disposition', 'order_unpack_queue', p_unpack_id, jsonb_build_object('order_id', v_unpack.order_id, 'disposition', p_disposition));
END;
$$;


-- ==========================================
-- PHASE 7: CYCLE COUNT RESOLUTION
-- ==========================================

DROP FUNCTION IF EXISTS public.resolve_cycle_count(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION resolve_cycle_count(
    p_count_id UUID,
    p_status TEXT, -- 'approved' or 'rejected'
    p_user_id UUID,
    p_location_id UUID DEFAULT NULL
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count RECORD;
    v_warehouse_id UUID;
    v_role TEXT;
BEGIN
    SELECT warehouse_id, role INTO v_warehouse_id, v_role FROM public.profiles 
    WHERE id = p_user_id AND is_suspended = FALSE;

    IF v_role NOT IN ('admin', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count.id IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;
    IF v_count.status != 'submitted' THEN RAISE EXCEPTION 'Count must be submitted to be resolved'; END IF;
    IF v_count.warehouse_id != v_warehouse_id AND v_role != 'admin' THEN RAISE EXCEPTION 'Cross-warehouse resolution blocked'; END IF;
    
    IF p_status = 'approved' AND v_count.variance != 0 THEN
        IF p_location_id IS NULL THEN
            RAISE EXCEPTION 'A valid location_id is required for physical inventory adjustments';
        END IF;

        IF v_count.batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET available_quantity = available_quantity + v_count.variance
            WHERE id = v_count.batch_id;
        END IF;

        UPDATE public.warehouse_stock 
        SET quantity = quantity + v_count.variance
        WHERE warehouse_id = v_count.warehouse_id AND product_id = v_count.product_id;

        -- Strict Placement Integrity
        INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
        VALUES (v_count.warehouse_id, p_location_id, v_count.product_id, GREATEST(v_count.variance, 0), 'cycle_count')
        ON CONFLICT (location_id, product_id) 
        DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

        INSERT INTO public.stock_ledgers (
            warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
        ) VALUES (
            v_count.warehouse_id, v_count.product_id, v_count.batch_id, v_count.variance, 'cycle_count', p_user_id
        );
    END IF;

    UPDATE public.cycle_counts 
    SET status = p_status, reviewer_id = p_user_id, resolved_at = now()
    WHERE id = p_count_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        p_user_id, 'cycle_count_' || p_status, 'cycle_count', p_count_id, 
        jsonb_build_object('product_id', v_count.product_id, 'batch_id', v_count.batch_id, 'variance', v_count.variance, 'location_id', p_location_id)
    );
END;
$$;
