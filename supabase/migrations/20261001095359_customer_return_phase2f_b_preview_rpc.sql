-- Phase 2F-B: Add read-only RPC for customer return preview to bypass profiles RLS

CREATE OR REPLACE FUNCTION public.warehouse_staff_get_customer_return_preview(p_task_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID := auth.uid();
    v_staff_role TEXT;
    v_task RECORD;
    v_driver RECORD;
    v_warehouse RECORD;
    v_items JSONB;
BEGIN
    IF v_staff_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role NOT IN ('warehouse_staff', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized role';
    END IF;

    -- Fetch task
    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    -- Fetch Driver Profile (authoritative)
    SELECT * INTO v_driver FROM public.profiles WHERE id = v_task.assigned_driver_id;

    -- Fetch Warehouse
    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;

    -- Fetch Items
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'expected_quantity', cri.expected_quantity,
            'order_items', jsonb_build_object(
                'product_name_snapshot', oi.product_name_snapshot,
                'sku_snapshot', oi.sku_snapshot
            )
        )
    ), '[]'::jsonb) INTO v_items
    FROM public.customer_return_items cri
    LEFT JOIN public.order_items oi ON cri.order_item_id = oi.id
    WHERE cri.customer_return_task_id = p_task_id;

    RETURN jsonb_build_object(
        'id', v_task.id,
        'status', v_task.status,
        'order_id', v_task.order_id,
        'reason', v_task.reason,
        'driver', jsonb_build_object('full_name', v_driver.full_name),
        'warehouses', jsonb_build_object('name', v_warehouse.name),
        'items', v_items
    );
END;
$$;
