-- ============================================================================
-- FLASHGO MIGRATION: 20261001121000_cancel_queue_regression_repair.sql
-- Purpose: Repair broken legacy queue paths and differentiate warehouse_cancellation
-- ============================================================================

-- 1. Repair process_order_cancellation Trigger (Warehouse Cancellation)
CREATE OR REPLACE FUNCTION public.process_order_cancellation()
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
                INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status, source_type, source_reference_id)
                VALUES (NEW.id, NEW.warehouse_id, 'pending', 'warehouse_cancellation', NEW.id)
                ON CONFLICT (source_type, source_reference_id) DO NOTHING;
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

        -- Drop Zone Allocation Lifecycle Cleanup
        UPDATE public.drop_zone_allocations 
        SET status = 'voided' 
        WHERE order_id = NEW.id 
          AND status IN ('allocated', 'placed', 'driver_assigned');

    END IF;
    RETURN NEW;
END;
$$;


-- 2. Repair staff_complete_return_intake (Failed Delivery / legacy)
CREATE OR REPLACE FUNCTION public.staff_complete_return_intake(p_intake_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
    v_total_expected INTEGER;
    v_total_received INTEGER;
    v_final_status TEXT;
BEGIN
    v_staff_id := auth.uid();

    -- Lock the intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;
    
    -- Idempotency check: if already completed/discrepancy, just return success
    IF v_intake.status IN ('completed', 'discrepancy') THEN
        RETURN jsonb_build_object('success', true, 'status', v_intake.status);
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    -- Calculate variance
    SELECT COALESCE(SUM(expected_quantity), 0), COALESCE(SUM(received_quantity), 0)
    INTO v_total_expected, v_total_received
    FROM public.return_intake_items
    WHERE return_intake_id = p_intake_id;

    IF v_total_received >= v_total_expected THEN
        v_final_status := 'completed';
    ELSE
        v_final_status := 'discrepancy';
    END IF;

    -- Update intake
    UPDATE public.return_intakes
    SET status = v_final_status,
        completed_at = now()
    WHERE id = p_intake_id;

    -- Retrieve the driver task to check return type
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = v_intake.driver_return_task_id;

    -- Update the driver task
    UPDATE public.driver_return_tasks
    SET status = 'completed',
        completed_at = now()
    WHERE id = v_task.id;

    -- Bridge disposition: Only create unpack queues for MERCHANDISE returns
    IF v_task.return_type = 'merchandise' THEN
        INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status, source_type, source_reference_id)
        SELECT DISTINCT order_id, v_intake.warehouse_id, 'pending', 'legacy', order_id
        FROM public.return_intake_items
        WHERE return_intake_id = p_intake_id
        ON CONFLICT (source_type, source_reference_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', v_final_status);
END;
$$;


-- 3. Extend process_order_unpack for warehouse_cancellation
CREATE OR REPLACE FUNCTION public.process_order_unpack(
    p_unpack_id UUID,
    p_disposition TEXT,
    p_user_id UUID,
    p_location_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_unpack RECORD;
    v_received RECORD;
    v_ledger RECORD;
    v_authoritative_intake_id UUID;
    v_admin_id UUID;
    v_remaining_to_restock INT;
    v_qty_to_restore INT;
    v_loc_record RECORD;
BEGIN
    -- 1. Hardened Admin Authorization
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    -- 2. Idempotency Guard & Lock
    SELECT * INTO v_unpack FROM public.order_unpack_queue WHERE id = p_unpack_id FOR UPDATE;
    IF v_unpack IS NULL THEN RAISE EXCEPTION 'Queue item not found'; END IF;
    IF v_unpack.status != 'pending' THEN RAISE EXCEPTION 'Already processed'; END IF;

    IF p_disposition NOT IN ('restocked', 'damaged', 'quarantine') THEN
        RAISE EXCEPTION 'Invalid disposition: %', p_disposition;
    END IF;

    -- 3. Server-side Location Validation
    IF p_disposition = 'restocked' THEN
        IF p_location_id IS NULL THEN
            RAISE EXCEPTION 'Restocking requires a valid location_id';
        END IF;
        
        SELECT * INTO v_loc_record FROM public.warehouse_locations 
        WHERE id = p_location_id AND warehouse_id = v_unpack.warehouse_id AND is_active = true;
        
        IF v_loc_record IS NULL THEN
            RAISE EXCEPTION 'Invalid active location or location does not belong to warehouse %', v_unpack.warehouse_id;
        END IF;
    END IF;

    -- 4. Unambiguous Intake Selection (Invariant Branching)
    IF v_unpack.source_type = 'warehouse_cancellation' THEN
        -- No intake exists or is required for warehouse cancellations
        v_authoritative_intake_id := NULL;
    ELSIF v_unpack.source_type = 'customer_return' THEN
        SELECT cri.id INTO v_authoritative_intake_id
        FROM public.customer_return_tasks crt
        JOIN public.customer_return_intakes cri ON cri.customer_return_task_id = crt.id
        WHERE crt.id = v_unpack.source_reference_id
          AND crt.status = 'at_warehouse'
          AND cri.status = 'completed'
        LIMIT 1;

        IF v_authoritative_intake_id IS NULL THEN
            RAISE EXCEPTION 'No completed authoritative customer return intake found for task %', v_unpack.source_reference_id;
        END IF;
    ELSE
        SELECT ri.id INTO v_authoritative_intake_id
        FROM public.driver_return_tasks drt
        JOIN public.return_intakes ri ON ri.driver_return_task_id = drt.id
        WHERE drt.order_id = v_unpack.order_id 
          AND drt.return_type = 'merchandise'
          AND ri.status IN ('completed', 'discrepancy')
        LIMIT 1;

        IF v_authoritative_intake_id IS NULL THEN
            RAISE EXCEPTION 'No completed authoritative return intake found for order %', v_unpack.order_id;
        END IF;
    END IF;

    -- 5. Inventory Reconciliation (Only for Restocked)
    IF p_disposition = 'restocked' THEN
        IF v_unpack.source_type = 'warehouse_cancellation' THEN
            -- WAREHOUSE CANCELLATION BRANCH
            FOR v_ledger IN
                SELECT product_id, batch_id, warehouse_id, order_item_id, SUM(quantity_change) as net_picked
                FROM public.stock_ledgers
                WHERE order_id = v_unpack.order_id 
                  AND warehouse_id = v_unpack.warehouse_id -- ENFORCE PROVENANCE
                  AND reason IN ('picking', 'picking_undo')
                GROUP BY product_id, batch_id, warehouse_id, order_item_id
                HAVING SUM(quantity_change) < 0
                ORDER BY MIN(created_at) ASC
            LOOP
                v_qty_to_restore := ABS(v_ledger.net_picked)::int;

                -- Restore Batch (with strict provenance check)
                IF v_ledger.batch_id IS NOT NULL THEN
                    UPDATE public.product_batches 
                    SET available_quantity = available_quantity + v_qty_to_restore
                    WHERE id = v_ledger.batch_id
                      AND warehouse_id = v_unpack.warehouse_id
                      AND product_id = v_ledger.product_id;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Batch % not found for product % at warehouse %', v_ledger.batch_id, v_ledger.product_id, v_unpack.warehouse_id;
                    END IF;
                END IF;

                -- Restore Warehouse Stock
                UPDATE public.warehouse_stock 
                SET quantity = quantity + v_qty_to_restore
                WHERE warehouse_id = v_unpack.warehouse_id AND product_id = v_ledger.product_id;
                
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Warehouse stock record not found for product %', v_ledger.product_id;
                END IF;
                
                -- Upsert Physical Placement
                INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
                VALUES (v_unpack.warehouse_id, p_location_id, v_ledger.product_id, v_qty_to_restore, 'restock')
                ON CONFLICT (location_id, product_id) 
                DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

                -- Record Ledger
                INSERT INTO public.stock_ledgers (
                    warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
                )
                VALUES (
                    v_unpack.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                    v_qty_to_restore, 'unpack_restock', v_unpack.order_id
                );
            END LOOP;

        ELSIF v_unpack.source_type = 'customer_return' THEN
            -- CUSTOMER RETURN BRANCH
            FOR v_received IN
                SELECT product_id, SUM(received_quantity) as total_received
                FROM public.customer_return_intake_items
                WHERE customer_return_intake_id = v_authoritative_intake_id
                GROUP BY product_id
                HAVING SUM(received_quantity) > 0
            LOOP
                v_remaining_to_restock := v_received.total_received;

                FOR v_ledger IN
                    SELECT batch_id, warehouse_id, order_item_id, SUM(quantity_change) as net_picked
                    FROM public.stock_ledgers
                    WHERE order_id = v_unpack.order_id 
                      AND product_id = v_received.product_id
                      AND warehouse_id = v_unpack.warehouse_id -- ENFORCE PROVENANCE
                      AND reason IN ('picking', 'picking_undo')
                    GROUP BY batch_id, warehouse_id, order_item_id
                    HAVING SUM(quantity_change) < 0
                    ORDER BY MIN(created_at) ASC
                LOOP
                    IF v_remaining_to_restock <= 0 THEN
                        EXIT;
                    END IF;

                    v_qty_to_restore := LEAST(v_remaining_to_restock, ABS(v_ledger.net_picked)::int);

                    -- Restore Batch (with strict provenance check)
                    IF v_ledger.batch_id IS NOT NULL THEN
                        UPDATE public.product_batches 
                        SET available_quantity = available_quantity + v_qty_to_restore
                        WHERE id = v_ledger.batch_id
                          AND warehouse_id = v_unpack.warehouse_id
                          AND product_id = v_received.product_id;
                        
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'Batch % not found for product % at warehouse %', v_ledger.batch_id, v_received.product_id, v_unpack.warehouse_id;
                        END IF;
                    END IF;

                    -- Restore Warehouse Stock
                    UPDATE public.warehouse_stock 
                    SET quantity = quantity + v_qty_to_restore
                    WHERE warehouse_id = v_unpack.warehouse_id AND product_id = v_received.product_id;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Warehouse stock record not found for product %', v_received.product_id;
                    END IF;
                    
                    -- Upsert Physical Placement
                    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
                    VALUES (v_unpack.warehouse_id, p_location_id, v_received.product_id, v_qty_to_restore, 'restock')
                    ON CONFLICT (location_id, product_id) 
                    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

                    -- Record Ledger
                    INSERT INTO public.stock_ledgers (
                        warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
                    )
                    VALUES (
                        v_unpack.warehouse_id, v_received.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                        v_qty_to_restore, 'unpack_restock', v_unpack.order_id
                    );

                    v_remaining_to_restock := v_remaining_to_restock - v_qty_to_restore;
                END LOOP;

                -- Discrepancy Guard: Did we physically receive more than we shipped?
                IF v_remaining_to_restock > 0 THEN
                    RAISE EXCEPTION 'Reconciliation error: Physically received % more of product % than was originally picked', v_remaining_to_restock, v_received.product_id;
                END IF;
            END LOOP;
        ELSE
            -- LEGACY BRANCH (Preserved Exactly)
            FOR v_received IN
                SELECT product_id, SUM(received_quantity) as total_received
                FROM public.return_intake_items
                WHERE return_intake_id = v_authoritative_intake_id
                GROUP BY product_id
                HAVING SUM(received_quantity) > 0
            LOOP
                v_remaining_to_restock := v_received.total_received;

                FOR v_ledger IN
                    SELECT batch_id, warehouse_id, order_item_id, SUM(quantity_change) as net_picked
                    FROM public.stock_ledgers
                    WHERE order_id = v_unpack.order_id 
                      AND product_id = v_received.product_id
                      AND warehouse_id = v_unpack.warehouse_id -- ENFORCE PROVENANCE
                      AND reason IN ('picking', 'picking_undo')
                    GROUP BY batch_id, warehouse_id, order_item_id
                    HAVING SUM(quantity_change) < 0
                    ORDER BY MIN(created_at) ASC
                LOOP
                    IF v_remaining_to_restock <= 0 THEN
                        EXIT;
                    END IF;

                    v_qty_to_restore := LEAST(v_remaining_to_restock, ABS(v_ledger.net_picked)::int);

                    -- Restore Batch (with strict provenance check)
                    IF v_ledger.batch_id IS NOT NULL THEN
                        UPDATE public.product_batches 
                        SET available_quantity = available_quantity + v_qty_to_restore
                        WHERE id = v_ledger.batch_id
                          AND warehouse_id = v_unpack.warehouse_id
                          AND product_id = v_received.product_id;
                        
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'Batch % not found for product % at warehouse %', v_ledger.batch_id, v_received.product_id, v_unpack.warehouse_id;
                        END IF;
                    END IF;

                    -- Restore Warehouse Stock
                    UPDATE public.warehouse_stock 
                    SET quantity = quantity + v_qty_to_restore
                    WHERE warehouse_id = v_unpack.warehouse_id AND product_id = v_received.product_id;
                    
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Warehouse stock record not found for product %', v_received.product_id;
                    END IF;
                    
                    -- Upsert Physical Placement
                    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
                    VALUES (v_unpack.warehouse_id, p_location_id, v_received.product_id, v_qty_to_restore, 'restock')
                    ON CONFLICT (location_id, product_id) 
                    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

                    -- Record Ledger
                    INSERT INTO public.stock_ledgers (
                        warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
                    )
                    VALUES (
                        v_unpack.warehouse_id, v_received.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                        v_qty_to_restore, 'unpack_restock', v_unpack.order_id
                    );

                    v_remaining_to_restock := v_remaining_to_restock - v_qty_to_restore;
                END LOOP;

                -- Discrepancy Guard: Did we physically receive more than we shipped?
                IF v_remaining_to_restock > 0 THEN
                    RAISE EXCEPTION 'Reconciliation error: Physically received % more of product % than was originally picked', v_remaining_to_restock, v_received.product_id;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 7. Deferred Queue Status Update
    UPDATE public.order_unpack_queue 
    SET status = p_disposition, processed_at = now(), processed_by = v_admin_id
    WHERE id = p_unpack_id;

    -- 8. Customer Return Completion Transition
    IF v_unpack.source_type = 'customer_return' THEN
        UPDATE public.customer_return_tasks
        SET status = 'completed'
        WHERE id = v_unpack.source_reference_id
          AND status = 'at_warehouse';
    END IF;

    -- 9. Audit Log (Preserving legacy p_user_id in payload, but logging v_admin_id as actor)
    INSERT INTO public.admin_audit_logs (
        admin_id, 
        action_type, 
        entity_type, 
        entity_id, 
        warehouse_id, 
        metadata
    )
    VALUES (
        v_admin_id, 
        'return_disposition', 
        'order_unpack_queue', 
        p_unpack_id::text, 
        v_unpack.warehouse_id,
        jsonb_build_object(
            'order_id', v_unpack.order_id, 
            'disposition', p_disposition,
            'legacy_user_id', p_user_id,
            'source_type', v_unpack.source_type
        )
    );
END;
$$;
