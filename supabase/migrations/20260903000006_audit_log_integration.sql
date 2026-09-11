-- Migration 20260903000006_audit_log_integration.sql

-- Add admin_audit_logs inserts to complete_putaway_task
CREATE OR REPLACE FUNCTION complete_putaway_task(
    p_task_id UUID,
    p_destination_location TEXT,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_task RECORD;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM public.profiles 
    WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff', 'picker') AND is_suspended = FALSE;

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF v_task.status = 'completed' THEN RETURN; END IF;
    IF v_task.warehouse_id != v_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Cross-warehouse putaway blocked';
    END IF;

    UPDATE public.putaway_tasks 
    SET status = 'completed', destination_location = TRIM(p_destination_location), worker_id = p_user_id, completed_at = now()
    WHERE id = p_task_id;

    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(p_destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        p_user_id, 'putaway_completed', 'putaway_task', p_task_id, 
        jsonb_build_object('product_id', v_task.product_id, 'batch_id', v_task.batch_id, 'quantity', v_task.quantity, 'destination', p_destination_location)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Add admin_audit_logs inserts to resolve_cycle_count
CREATE OR REPLACE FUNCTION resolve_cycle_count(
    p_count_id UUID,
    p_status TEXT, -- 'approved' or 'rejected'
    p_user_id UUID
) RETURNS void AS $$
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
    
    UPDATE public.cycle_counts 
    SET status = p_status, reviewer_id = p_user_id, resolved_at = now()
    WHERE id = p_count_id;

    IF p_status = 'approved' AND v_count.variance != 0 THEN
        IF v_count.batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET available_quantity = available_quantity + v_count.variance
            WHERE id = v_count.batch_id;
        END IF;

        UPDATE public.warehouse_stock 
        SET quantity = quantity + v_count.variance
        WHERE warehouse_id = v_count.warehouse_id AND product_id = v_count.product_id;

        INSERT INTO public.stock_ledgers (
            warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
        ) VALUES (
            v_count.warehouse_id, v_count.product_id, v_count.batch_id, v_count.variance, 'cycle_count', p_user_id
        );
    END IF;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        p_user_id, 'cycle_count_' || p_status, 'cycle_count', p_count_id, 
        jsonb_build_object('product_id', v_count.product_id, 'batch_id', v_count.batch_id, 'variance', v_count.variance)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Add admin_audit_logs inserts to process_order_unpack
CREATE OR REPLACE FUNCTION process_order_unpack(
    p_unpack_id UUID,
    p_disposition TEXT, -- 'restocked', 'damaged', 'quarantine'
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_unpack RECORD;
    v_is_suspended BOOLEAN;
    v_valid_role BOOLEAN;
    v_ledger RECORD;
BEGIN
    SELECT COALESCE(is_suspended, FALSE), role IN ('admin', 'warehouse_manager')
    INTO v_is_suspended, v_valid_role
    FROM public.profiles WHERE id = p_user_id;

    IF NOT v_valid_role THEN RAISE EXCEPTION 'Unauthorized: User is not a manager or admin'; END IF;
    IF v_is_suspended THEN RAISE EXCEPTION 'Account is suspended.'; END IF;

    SELECT * INTO v_unpack FROM public.order_unpack_queue WHERE id = p_unpack_id FOR UPDATE;
    IF v_unpack.id IS NULL THEN RAISE EXCEPTION 'Unpack task not found'; END IF;
    IF v_unpack.status != 'pending' THEN RAISE EXCEPTION 'Unpack task already processed'; END IF;

    IF p_disposition NOT IN ('restocked', 'damaged', 'quarantine') THEN
        RAISE EXCEPTION 'Invalid disposition: %', p_disposition;
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

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        p_user_id, 'return_disposition', 'order_unpack_queue', p_unpack_id, 
        jsonb_build_object('order_id', v_unpack.order_id, 'disposition', p_disposition)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
