-- Migration: 20261004100923_admin_unpack_queue_enriched.sql

CREATE OR REPLACE FUNCTION public.admin_get_order_unpack_queue_enriched(
    p_warehouse_id uuid, 
    p_filter_start timestamptz DEFAULT NULL, 
    p_filter_end timestamptz DEFAULT NULL,
    p_filter_status text DEFAULT 'all'
)
RETURNS TABLE (
    id uuid,
    order_id uuid,
    warehouse_id uuid,
    status text,
    created_at timestamptz,
    processed_at timestamptz,
    processed_by uuid,
    source_type text,
    source_reference_id uuid,
    "order" jsonb,
    items_summary text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    -- 1. Hardened Admin Authorization
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    -- 2. Read-only Data Aggregation
    RETURN QUERY
    WITH items_agg AS (
        SELECT 
            q.id as queue_id,
            (
                CASE 
                    WHEN q.source_type = 'warehouse_cancellation' THEN
                        (
                            SELECT jsonb_agg(jsonb_build_object('product_name', p.name, 'quantity', items.qty) ORDER BY p.name ASC)
                            FROM (
                                SELECT sl.product_id, ABS(SUM(sl.quantity_change)) as qty
                                FROM public.stock_ledgers sl
                                WHERE sl.order_id = q.order_id
                                  AND sl.warehouse_id = q.warehouse_id
                                  AND sl.reason IN ('picking', 'picking_undo')
                                GROUP BY sl.product_id
                                HAVING SUM(sl.quantity_change) < 0
                            ) items
                            JOIN public.products p ON p.id = items.product_id
                        )
                    WHEN q.source_type = 'customer_return' THEN
                        (
                            SELECT jsonb_agg(jsonb_build_object('product_name', p.name, 'quantity', items.qty) ORDER BY p.name ASC)
                            FROM (
                                SELECT cri.product_id, SUM(cri.received_quantity) as qty
                                FROM public.customer_return_tasks crt
                                JOIN public.customer_return_intakes intk ON intk.customer_return_task_id = crt.id
                                JOIN public.customer_return_intake_items cri ON cri.customer_return_intake_id = intk.id
                                WHERE crt.id = q.source_reference_id
                                  AND intk.status = 'completed'
                                GROUP BY cri.product_id
                                HAVING SUM(cri.received_quantity) > 0
                            ) items
                            JOIN public.products p ON p.id = items.product_id
                        )
                    ELSE
                        (
                            SELECT jsonb_agg(jsonb_build_object('product_name', p.name, 'quantity', items.qty) ORDER BY p.name ASC)
                            FROM (
                                SELECT rii.product_id, SUM(rii.received_quantity) as qty
                                FROM public.driver_return_tasks drt
                                JOIN public.return_intakes intk ON intk.driver_return_task_id = drt.id
                                JOIN public.return_intake_items rii ON rii.return_intake_id = intk.id
                                WHERE drt.order_id = q.order_id
                                  AND drt.return_type = 'merchandise'
                                  AND intk.status IN ('completed', 'discrepancy')
                                GROUP BY rii.product_id
                                HAVING SUM(rii.received_quantity) > 0
                            ) items
                            JOIN public.products p ON p.id = items.product_id
                        )
                END
            ) as items_data
        FROM public.order_unpack_queue q
        WHERE q.warehouse_id = p_warehouse_id
          AND (p_filter_status = 'all' OR q.status = p_filter_status)
          AND (p_filter_start IS NULL OR q.created_at >= p_filter_start)
          AND (p_filter_end IS NULL OR q.created_at < p_filter_end)
    )
    SELECT 
        q.id,
        q.order_id,
        q.warehouse_id,
        q.status,
        q.created_at,
        q.processed_at,
        q.processed_by,
        q.source_type,
        q.source_reference_id,
        to_jsonb(o.*) as "order",
        CASE
            WHEN agg.items_data IS NULL OR jsonb_array_length(agg.items_data) = 0 THEN 'Item details unavailable'
            WHEN jsonb_array_length(agg.items_data) = 1 THEN 
                (agg.items_data->0->>'product_name') || ' ×' || (agg.items_data->0->>'quantity')
            ELSE 
                (agg.items_data->0->>'product_name') || ' ×' || (agg.items_data->0->>'quantity') || ' + ' || (jsonb_array_length(agg.items_data) - 1)::text || ' more'
        END as items_summary
    FROM public.order_unpack_queue q
    JOIN public.orders o ON o.id = q.order_id
    LEFT JOIN items_agg agg ON agg.queue_id = q.id
    WHERE q.warehouse_id = p_warehouse_id
      AND (p_filter_status = 'all' OR q.status = p_filter_status)
      AND (p_filter_start IS NULL OR q.created_at >= p_filter_start)
      AND (p_filter_end IS NULL OR q.created_at < p_filter_end)
    ORDER BY q.created_at DESC;
END;
$$;
