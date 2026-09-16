-- Migration 20260916000164_return_task_order_identity.sql

-- 1. Add order_id to driver_return_tasks
ALTER TABLE public.driver_return_tasks 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- 2. Add invariant for new writes without invalidating legacy
ALTER TABLE public.driver_return_tasks 
ADD CONSTRAINT driver_return_tasks_merchandise_order_id_check 
CHECK (
    return_type != 'merchandise' 
    OR order_id IS NOT NULL 
) NOT VALID;

-- 3. Replace driver_mark_delivery_failed to capture order_id BEFORE cancellation
CREATE OR REPLACE FUNCTION public.driver_mark_delivery_failed(
    p_trip_id UUID, 
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID;
    v_trip public.logistics_trips;
    v_order public.orders;
    v_return_task_id UUID;
    v_warehouse_id UUID;
BEGIN
    v_driver_id := auth.uid();

    IF p_reason NOT IN ('customer_unavailable', 'customer_refused', 'location_inaccessible', 'unreachable') THEN
        RAISE EXCEPTION 'Invalid failure reason';
    END IF;

    -- Lock trip
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.driver_id != v_driver_id THEN
        RAISE EXCEPTION 'Unauthorized: Not your trip';
    END IF;

    IF v_trip.status != 'in_transit' THEN
        RAISE EXCEPTION 'Trip is not in transit';
    END IF;

    -- Find and lock the order associated with this trip BEFORE cancellation
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No order associated with this trip';
    END IF;

    IF v_order.status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Order is not out for delivery';
    END IF;

    -- Get warehouse ID from trip
    v_warehouse_id := v_trip.warehouse_id;

    -- Create or update merchandise return obligation WITH the order_id
    INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id, status, return_type, order_id)
    VALUES (v_driver_id, p_trip_id, v_warehouse_id, 'pending', 'merchandise', v_order.id)
    ON CONFLICT (trip_id, driver_id, return_type) 
    WHERE return_type = 'merchandise'
    DO UPDATE SET 
        status = 'pending',
        order_id = EXCLUDED.order_id
    RETURNING id INTO v_return_task_id;

    -- Complete Trip
    UPDATE public.logistics_trips 
    SET status = 'completed', 
        delivered_at = COALESCE(delivered_at, NOW()),
        updated_at = NOW() 
    WHERE id = p_trip_id;

    -- Cancel Order
    UPDATE public.orders 
    SET status = 'cancelled', 
        updated_at = NOW() 
    WHERE id = v_order.id;

    -- Insert into order_events
    INSERT INTO public.order_events (
        order_id, actor_id, actor_role, event_type, previous_status, new_status, description
    ) VALUES (
        v_order.id, v_driver_id, NULL, 'delivery_failed', 'out_for_delivery', 'cancelled', 'Delivery failed: ' || p_reason
    );

    RETURN jsonb_build_object('success', true, 'return_task_id', v_return_task_id);
END;
$$;

-- 4. Replace staff_start_return_intake to use v_task.order_id
CREATE OR REPLACE FUNCTION public.staff_start_return_intake(
    p_driver_id UUID,
    p_return_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_warehouse_id UUID;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Check staff authorization
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY start_time DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Active shift required';
    END IF;

    -- Find the pending return task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE driver_id = p_driver_id
      AND return_type = p_return_type
      AND status = 'pending'
      AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending return task of type % found for this driver at this warehouse', p_return_type;
    END IF;

    -- If merchandise, require order_id
    IF v_task.return_type = 'merchandise' AND v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Merchandise return task is missing order_id';
    END IF;

    -- Verify no active intake
    IF EXISTS (
        SELECT 1 FROM public.return_intakes 
        WHERE driver_return_task_id = v_task.id AND status = 'scanning'
    ) THEN
        RAISE EXCEPTION 'An active intake already exists for this return task';
    END IF;

    -- Create intake
    INSERT INTO public.return_intakes (driver_return_task_id, warehouse_id, received_by_staff_id, status)
    VALUES (v_task.id, v_warehouse_id, v_staff_id, 'scanning')
    RETURNING id INTO v_intake_id;

    -- For merchandise, derive expected items from task.order_id -> order_items
    IF v_task.return_type = 'merchandise' THEN
        INSERT INTO public.return_intake_items (
            return_intake_id, order_id, product_id, expected_quantity, scanned_quantity
        )
        SELECT 
            v_intake_id,
            v_task.order_id,
            oi.product_id,
            oi.quantity,
            0
        FROM public.order_items oi
        WHERE oi.order_id = v_task.order_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'intake_id', v_intake_id);
END;
$$;

-- 5. Create staff_reload_return_intake_items RPC for recovery
CREATE OR REPLACE FUNCTION public.staff_reload_return_intake_items(
    p_intake_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_warehouse_id UUID;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
    v_inserted_count INTEGER;
BEGIN
    v_staff_id := auth.uid();

    -- Check staff authorization
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY start_time DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Active shift required';
    END IF;

    -- Find intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    IF v_intake.status != 'scanning' THEN
        RAISE EXCEPTION 'Cannot reload items for an intake that is not in scanning status';
    END IF;

    -- Find task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_intake.driver_return_task_id FOR UPDATE;

    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'Cannot reload items for non-merchandise return task';
    END IF;

    IF v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Task does not have an associated order_id';
    END IF;

    -- Verify expected item set is currently empty and no received scans exist
    IF EXISTS (SELECT 1 FROM public.return_intake_items WHERE return_intake_id = p_intake_id) THEN
        RAISE EXCEPTION 'Intake items already exist. Cannot reload.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.return_scan_operations WHERE return_intake_id = p_intake_id) THEN
        RAISE EXCEPTION 'Scan operations already exist. Cannot reload.';
    END IF;

    -- Populate expected rows idempotently
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, scanned_quantity
    )
    SELECT 
        p_intake_id,
        v_task.order_id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.order_items oi
    WHERE oi.order_id = v_task.order_id;
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    RETURN jsonb_build_object('success', true, 'reloaded_count', v_inserted_count);
END;
$$;
