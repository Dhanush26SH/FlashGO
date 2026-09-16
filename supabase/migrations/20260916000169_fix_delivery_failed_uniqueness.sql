-- Migration 20260916000169_fix_delivery_failed_uniqueness.sql

-- 1. Create the partial unique index to enforce exactly one merchandise return per order
CREATE UNIQUE INDEX IF NOT EXISTS driver_return_tasks_merchandise_order_id_idx 
ON public.driver_return_tasks (order_id) 
WHERE return_type = 'merchandise' AND order_id IS NOT NULL;

-- 2. Correct the RPC to use 'required', remove invalid ON CONFLICT, and fix delivered_at semantic
CREATE OR REPLACE FUNCTION public.driver_mark_delivery_failed(p_trip_id UUID, p_reason TEXT)
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

    -- Strict Idempotency Check: Reject if already cancelled/failed
    IF v_order.status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Order is not out for delivery';
    END IF;

    -- Get warehouse ID from trip
    v_warehouse_id := v_trip.warehouse_id;

    -- Create merchandise return obligation WITH the order_id
    -- Status must be 'required'. No ON CONFLICT is needed because the FOR UPDATE lock 
    -- and order status check above strictly enforce exactly-once execution.
    INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id, status, return_type, order_id)
    VALUES (v_driver_id, p_trip_id, v_warehouse_id, 'required', 'merchandise', v_order.id)
    RETURNING id INTO v_return_task_id;

    -- Complete Trip (Failed trips do NOT set delivered_at)
    UPDATE public.logistics_trips 
    SET status = 'completed', 
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
