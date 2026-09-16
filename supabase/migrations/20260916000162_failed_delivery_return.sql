-- ============================================================================
-- FLASHGO MIGRATION: 20260916000162_failed_delivery_return
-- Purpose: Introduce genuine Driver failed-delivery merchandise return flow
-- ============================================================================

-- 1. Enforce return_type on driver_return_tasks
ALTER TABLE public.driver_return_tasks 
ADD COLUMN IF NOT EXISTS return_type TEXT NOT NULL DEFAULT 'cooler' 
CHECK (return_type IN ('cooler', 'merchandise'));

-- 2. Modify staff_start_return_intake to reject non-merchandise returns
CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_raw_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_token_hash TEXT;
    v_challenge public.return_handover_challenges;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- Must have an active shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Hash the incoming token
    v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

    -- Find and lock the challenge (atomic check-and-consume)
    SELECT * INTO v_challenge
    FROM public.return_handover_challenges
    WHERE token_hash = v_token_hash 
      AND expires_at > now() 
      AND consumed_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or consumed QR challenge';
    END IF;

    -- Find the task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_challenge.driver_return_task_id AND status = 'required';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task is no longer required';
    END IF;

    -- ENFORCE MERCHANDISE RETURN ONLY
    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'NOT_MERCHANDISE_RETURN';
    END IF;

    -- Ensure staff shift warehouse matches task warehouse
    IF v_active_shift.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse than the return task';
    END IF;

    -- Mark challenge consumed
    UPDATE public.return_handover_challenges 
    SET consumed_at = now() 
    WHERE id = v_challenge.id;

    -- Insert the intake session
    INSERT INTO public.return_intakes (
        driver_return_task_id, trip_id, driver_id, warehouse_id, received_by_staff_id, status
    )
    VALUES (
        v_task.id, v_task.trip_id, v_task.driver_id, v_task.warehouse_id, v_staff_id, 'scanning'
    )
    RETURNING id INTO v_intake_id;

    -- Populate expected return items using valid cancelled order statuses for the trip
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        v_intake_id,
        o.id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.trip_id = v_task.trip_id AND o.status = 'cancelled';

    RETURN v_intake_id;
END;
$$;

-- 3. Modify staff_complete_return_intake to bridge disposition
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
        INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status)
        SELECT DISTINCT order_id, v_intake.warehouse_id, 'pending'
        FROM public.return_intake_items
        WHERE return_intake_id = p_intake_id
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', v_final_status);
END;
$$;


-- 4. Create driver_mark_delivery_failed RPC
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

    -- Find and lock the order associated with this trip
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No order associated with this trip';
    END IF;

    IF v_order.status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Order is not out for delivery';
    END IF;

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

    -- Create Merchandise Return Task
    -- Duplicate creation is impossible due to the terminal status lock on the trip and order.
    INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id, return_type)
    VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id, 'merchandise');

    RETURN jsonb_build_object('success', true);
END;
$$;
