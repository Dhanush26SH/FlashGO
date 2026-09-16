-- Migration 172: Fix admin_audit_logs schema mismatch in process_order_unpack

CREATE OR REPLACE FUNCTION public.process_order_unpack(p_unpack_id uuid, p_disposition text, p_user_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

    -- 4. Unambiguous Intake Selection (Invariant)
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

    -- 5. Inventory Reconciliation (Only for Restocked)
    IF p_disposition = 'restocked' THEN
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

            -- 6. Discrepancy Guard: Did we physically receive more than we shipped?
            IF v_remaining_to_restock > 0 THEN
                RAISE EXCEPTION 'Reconciliation error: Physically received % more of product % than was originally picked', v_remaining_to_restock, v_received.product_id;
            END IF;
        END LOOP;
    END IF;

    -- 7. Deferred Queue Status Update
    UPDATE public.order_unpack_queue 
    SET status = p_disposition, processed_at = now(), processed_by = v_admin_id
    WHERE id = p_unpack_id;

    -- 8. Audit Log (Preserving legacy p_user_id in payload, but logging v_admin_id as actor)
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
            'legacy_user_id', p_user_id
        )
    );
END;
$function$;
