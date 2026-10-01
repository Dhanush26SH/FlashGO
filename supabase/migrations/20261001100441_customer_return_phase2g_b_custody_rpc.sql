-- Phase 2G-B: Customer Return Custody Acceptance RPC

CREATE OR REPLACE FUNCTION public.warehouse_staff_receive_customer_return(p_task_id UUID, p_raw_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID := auth.uid();
    v_staff_role TEXT;
    v_warehouse_id UUID;
    v_task RECORD;
    v_challenge RECORD;
    v_intake_id UUID;
    v_raw_token_val TEXT;
BEGIN
    -- 1. Require authenticated user
    IF v_staff_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Verify authorized Warehouse Staff role
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role NOT IN ('warehouse_staff', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized role: Must be warehouse staff';
    END IF;

    -- 3. Verify an active staff shift and get warehouse_id
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;
    
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- 4. Lock the customer-return task FOR UPDATE
    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    -- 5. Verify task status is exactly picked_up
    IF v_task.status != 'picked_up' THEN
        RAISE EXCEPTION 'Task must be in picked_up status to receive custody';
    END IF;

    -- 6. Verify assigned warehouse matches shift warehouse
    IF v_task.warehouse_id != v_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Task is assigned to a different warehouse';
    END IF;

    -- 7. Verify assigned Driver exists
    IF v_task.assigned_driver_id IS NULL THEN
        RAISE EXCEPTION 'Task is missing an assigned driver';
    END IF;

    -- Extract token value (e.g. CUSTOMER_RETURN_HANDOVER:uuid:raw_token)
    IF p_raw_token NOT LIKE 'CUSTOMER_RETURN_HANDOVER:%:%' THEN
        RAISE EXCEPTION 'Invalid token payload format';
    END IF;
    v_raw_token_val := SPLIT_PART(p_raw_token, ':', 3);

    -- 8. Lock the challenge FOR UPDATE
    SELECT * INTO v_challenge
    FROM public.customer_return_handover_challenges
    WHERE customer_return_task_id = p_task_id
    FOR UPDATE;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'No challenge found for this task';
    END IF;

    -- 9 & 10. Require unconsumed and unexpired
    IF v_challenge.consumed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Challenge has already been consumed';
    END IF;
    IF v_challenge.expires_at <= NOW() THEN
        RAISE EXCEPTION 'Challenge has expired';
    END IF;

    -- 11. Cryptographically verify token
    IF v_challenge.token_hash != extensions.crypt(v_raw_token_val, v_challenge.token_hash) THEN
        RAISE EXCEPTION 'Invalid token hash';
    END IF;

    -- 12. Verify authoritative items exist
    IF NOT EXISTS (
        SELECT 1 FROM public.customer_return_items 
        WHERE customer_return_task_id = p_task_id AND expected_quantity > 0
    ) THEN
        RAISE EXCEPTION 'Task has no valid expected items';
    END IF;

    -- 13. Prevent duplicate intake creation
    IF EXISTS (
        SELECT 1 FROM public.customer_return_intakes
        WHERE customer_return_task_id = p_task_id
    ) THEN
        RAISE EXCEPTION 'An intake already exists for this task';
    END IF;

    -- 14. Create exactly one customer_return_intakes row (status: received)
    INSERT INTO public.customer_return_intakes (
        customer_return_task_id, warehouse_id, driver_id, received_by_staff_id, status
    ) VALUES (
        p_task_id, v_warehouse_id, v_task.assigned_driver_id, v_staff_id, 'received'
    ) RETURNING id INTO v_intake_id;

    -- 15. Populate customer_return_intake_items from backend data
    INSERT INTO public.customer_return_intake_items (
        customer_return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        v_intake_id,
        v_task.order_id,
        oi.product_id,
        cri.expected_quantity,
        cri.expected_quantity -- exact manifest acceptance
    FROM public.customer_return_items cri
    JOIN public.order_items oi ON cri.order_item_id = oi.id
    WHERE cri.customer_return_task_id = p_task_id;

    -- 16. Consume the challenge
    UPDATE public.customer_return_handover_challenges
    SET consumed_at = NOW()
    WHERE id = v_challenge.id;

    -- 17. Transition task to at_warehouse
    UPDATE public.customer_return_tasks
    SET status = 'at_warehouse',
        arrived_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;

    RETURN jsonb_build_object('success', true, 'intake_id', v_intake_id);
END;
$$;
