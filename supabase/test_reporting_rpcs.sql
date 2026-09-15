BEGIN;

-- Picker History RPC
CREATE OR REPLACE FUNCTION public.admin_get_picker_work_history(
    p_warehouse_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_worker_id UUID DEFAULT NULL
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

    -- Summary
    SELECT jsonb_build_object(
        'slots_booked', count(DISTINCT s.id),
        'slots_completed', count(DISTINCT CASE WHEN s.status IN ('completed', 'ended') THEN s.id END),
        'active_minutes', COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(s.completed_at, LEAST(now(), s.shift_end)) - s.started_at))/60), 0),
        'orders_completed', count(DISTINCT CASE WHEN o.picking_status = 'completed' THEN o.id END),
        'total_units_picked', COALESCE(sum(oi.picked_quantity) FILTER (WHERE o.picking_status = 'completed'), 0),
        'total_earnings', COALESCE(sum(sp.total_amount), 0)
    ) INTO v_summary
    FROM staff_shifts s
    LEFT JOIN orders o ON o.picker_id = s.staff_id AND o.picker_assigned_at >= s.started_at AND o.picker_assigned_at <= COALESCE(s.completed_at, s.shift_end)
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN staff_shift_payouts sp ON sp.shift_id = s.id
    WHERE s.warehouse_id = p_warehouse_id
      AND s.started_at >= p_start_date
      AND s.started_at <= p_end_date
      AND (p_worker_id IS NULL OR s.staff_id = p_worker_id)
      AND (SELECT role FROM profiles WHERE id = s.staff_id) = 'picker';

    -- Details
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'shift_id', s.id,
            'worker_id', s.staff_id,
            'worker_name', p.full_name,
            'status', s.status,
            'started_at', s.started_at,
            'completed_at', s.completed_at,
            'shift_start', s.shift_start,
            'shift_end', s.shift_end,
            'earnings', (SELECT total_amount FROM staff_shift_payouts WHERE shift_id = s.id LIMIT 1),
            'orders_worked', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'order_id', o2.id,
                        'order_number', o2.order_number,
                        'status', o2.status,
                        'picking_status', o2.picking_status,
                        'assigned_at', o2.picker_assigned_at,
                        'units_picked', (SELECT sum(picked_quantity) FROM order_items WHERE order_id = o2.id)
                    )
                ), '[]'::jsonb)
                FROM orders o2 
                WHERE o2.picker_id = s.staff_id 
                  AND o2.picker_assigned_at >= s.started_at 
                  AND o2.picker_assigned_at <= COALESCE(s.completed_at, s.shift_end)
            )
        ) ORDER BY s.started_at DESC
    ), '[]'::jsonb) INTO v_details
    FROM staff_shifts s
    JOIN profiles p ON p.id = s.staff_id
    WHERE s.warehouse_id = p_warehouse_id
      AND s.started_at >= p_start_date
      AND s.started_at <= p_end_date
      AND (p_worker_id IS NULL OR s.staff_id = p_worker_id)
      AND p.role = 'picker';

    RETURN jsonb_build_object('summary', v_summary, 'details', v_details);
END;
$$;

-- Driver History RPC
CREATE OR REPLACE FUNCTION public.admin_get_driver_work_history(
    p_warehouse_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_worker_id UUID DEFAULT NULL
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

    -- Summary
    SELECT jsonb_build_object(
        'gigs_booked', count(DISTINCT ds.id),
        'active_minutes', COALESCE(sum(EXTRACT(EPOCH FROM (COALESCE(ds.updated_at, LEAST(now(), (SELECT shift_end FROM staff_shifts WHERE id = ds.staff_shift_id))) - (SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id)))/60), 0),
        'deliveries_assigned', count(DISTINCT o.id),
        'deliveries_completed', count(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END),
        'cod_collected', count(DISTINCT CASE WHEN o.cod_collected = true THEN o.id END)
    ) INTO v_summary
    FROM driver_sessions ds
    LEFT JOIN logistics_trips lt ON lt.driver_id = ds.driver_id AND lt.created_at >= (SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id) AND lt.created_at <= (SELECT shift_end FROM staff_shifts WHERE id = ds.staff_shift_id)
    LEFT JOIN orders o ON o.trip_id = lt.id
    WHERE (SELECT warehouse_id FROM staff_shifts WHERE id = ds.staff_shift_id) = p_warehouse_id
      AND (SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id) >= p_start_date
      AND (SELECT shift_start FROM staff_shifts WHERE id = ds.staff_shift_id) <= p_end_date
      AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id);

    -- Details
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'session_id', ds.id,
            'worker_id', ds.driver_id,
            'worker_name', p.full_name,
            'status', ds.status,
            'shift_start', ss.shift_start,
            'shift_end', ss.shift_end,
            'trips', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'trip_id', lt.id,
                        'status', lt.status,
                        'created_at', lt.created_at,
                        'delivered_at', lt.delivered_at,
                        'orders', (
                            SELECT COALESCE(jsonb_agg(
                                jsonb_build_object(
                                    'order_id', o2.id,
                                    'order_number', o2.order_number,
                                    'status', o2.status,
                                    'cod_collected', o2.cod_collected
                                )
                            ), '[]'::jsonb)
                            FROM orders o2 WHERE o2.trip_id = lt.id
                        )
                    )
                ), '[]'::jsonb)
                FROM logistics_trips lt 
                WHERE lt.driver_id = ds.driver_id 
                  AND lt.created_at >= ss.shift_start 
                  AND lt.created_at <= ss.shift_end
            )
        ) ORDER BY ss.shift_start DESC
    ), '[]'::jsonb) INTO v_details
    FROM driver_sessions ds
    JOIN profiles p ON p.id = ds.driver_id
    JOIN staff_shifts ss ON ss.id = ds.staff_shift_id
    WHERE ss.warehouse_id = p_warehouse_id
      AND ss.shift_start >= p_start_date
      AND ss.shift_start <= p_end_date
      AND (p_worker_id IS NULL OR ds.driver_id = p_worker_id);

    RETURN jsonb_build_object('summary', v_summary, 'details', v_details);
END;
$$;

-- Warehouse Staff History RPC
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
      AND (SELECT role FROM profiles WHERE id = s.staff_id) = 'warehouse_staff';

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
    )
    SELECT COALESCE(jsonb_agg(row_to_json(e) ORDER BY e.timestamp DESC), '[]'::jsonb) INTO v_details
    FROM events e;

    -- Add some aggregated summary data for duties
    v_summary = v_summary || jsonb_build_object(
        'putaway_units', (
            SELECT COALESCE(sum(placed_quantity), 0) FROM putaway_tasks 
            WHERE warehouse_id = p_warehouse_id AND completed_at >= p_start_date AND completed_at <= p_end_date AND (p_worker_id IS NULL OR worker_id = p_worker_id)
        ),
        'audits_completed', (
            SELECT count(id) FROM cycle_counts 
            WHERE warehouse_id = p_warehouse_id AND submitted_at >= p_start_date AND submitted_at <= p_end_date AND status = 'submitted' AND (p_worker_id IS NULL OR counter_id = p_worker_id)
        ),
        'inward_units_processed', (
            SELECT COALESCE(sum(gri.accepted_quantity + gri.damaged_quantity + gri.expired_quantity), 0) 
            FROM goods_receipt_items gri 
            JOIN goods_receipts gr ON gr.id = gri.receipt_id 
            WHERE gr.warehouse_id = p_warehouse_id AND gr.created_at >= p_start_date AND gr.created_at <= p_end_date AND (p_worker_id IS NULL OR gr.received_by = p_worker_id)
        )
    );

    RETURN jsonb_build_object('summary', v_summary, 'details', v_details);
END;
$$;

ROLLBACK;
