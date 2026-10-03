-- Phase 14: Batch Status Consistency Repair

-- 1. Repair existing inconsistent rows
UPDATE public.product_batches
SET status = 'active'
WHERE available_quantity > 0 
  AND status = 'depleted' 
  AND expiry_date >= CURRENT_DATE;

-- 2. Prevent Recurrence
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
                    SET available_quantity = available_quantity + v_qty_to_restore,
                        status = CASE WHEN available_quantity + v_qty_to_restore > 0 AND expiry_date >= CURRENT_DATE THEN 'active' ELSE status END
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
                        SET available_quantity = available_quantity + v_qty_to_restore,
                            status = CASE WHEN available_quantity + v_qty_to_restore > 0 AND expiry_date >= CURRENT_DATE THEN 'active' ELSE status END
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
                        SET available_quantity = available_quantity + v_qty_to_restore,
                            status = CASE WHEN available_quantity + v_qty_to_restore > 0 AND expiry_date >= CURRENT_DATE THEN 'active' ELSE status END
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
            SET available_quantity = available_quantity + v_count.variance,
                status = CASE WHEN available_quantity + v_count.variance > 0 AND expiry_date >= CURRENT_DATE THEN 'active' ELSE status END
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
        admin_id, 
        action_type, 
        entity_type, 
        entity_id, 
        warehouse_id,
        metadata
    ) VALUES (
        p_user_id, 
        'cycle_count_' || p_status, 
        'cycle_count', 
        p_count_id::text, 
        v_count.warehouse_id,
        jsonb_build_object('product_id', v_count.product_id, 'batch_id', v_count.batch_id, 'variance', v_count.variance, 'location_id', p_location_id)
    );
END;
$$;
