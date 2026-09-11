-- Fix broken handoff_order RPC which referenced non-existent order_id column on logistics_trips

CREATE OR REPLACE FUNCTION public.handoff_order(
    p_order_id UUID,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_trip RECORD;
    v_is_suspended BOOLEAN;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_warehouse_id, v_is_suspended
    FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff');

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_is_suspended THEN RAISE EXCEPTION 'Account suspended'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.status IN ('handed_off', 'out_for_delivery', 'delivered') THEN RETURN; END IF;
    IF v_order.status != 'staged' THEN
        RAISE EXCEPTION 'Order must be staged to be handed off';
    END IF;

    -- Verify trip/driver assignment using the trip_id on the order
    IF v_order.trip_id IS NULL THEN
        RAISE EXCEPTION 'Order is not assigned to a trip';
    END IF;

    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = v_order.trip_id;
    IF v_trip.id IS NULL OR v_trip.driver_id IS NULL THEN
        RAISE EXCEPTION 'Order trip does not have an assigned driver';
    END IF;

    UPDATE public.orders SET status = 'handed_off', updated_at = now() WHERE id = p_order_id;
    
    UPDATE public.order_packing_operations 
    SET handed_off_by = p_user_id, handed_off_at = now(), trip_id = v_trip.id, driver_id = v_trip.driver_id
    WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
