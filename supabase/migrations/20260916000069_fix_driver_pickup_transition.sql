-- 20260916000069_fix_driver_pickup_transition.sql
-- Overrides the broken driver_confirm_order_pickup from migration 25 that was incorrectly setting order status to 'in_transit'

CREATE OR REPLACE FUNCTION public.driver_confirm_order_pickup(p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.status = 'in_transit' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_IN_TRANSIT');
    END IF;
    IF v_trip.status != 'accepted' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ACCEPTED');
    END IF;

    -- Get first order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ORDER');
    END IF;
    
    -- The order must be handed_off by the picker before the driver can confirm pickup
    IF v_order.status = 'packed' THEN
        RETURN jsonb_build_object('success', false, 'code', 'PICKER_NOT_HANDED_OFF');
    END IF;
    IF v_order.status != 'handed_off' THEN
         RETURN jsonb_build_object('success', false, 'code', 'INVALID_ORDER_STATUS', 'status', v_order.status);
    END IF;

    -- Correct transition: logistics_trips.status -> 'in_transit'
    UPDATE public.logistics_trips 
    SET status = 'in_transit', updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;
    
    -- Correct transition: orders.status -> 'out_for_delivery'
    UPDATE public.orders 
    SET status = 'out_for_delivery', updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id AND status NOT IN ('cancelled');

    RETURN jsonb_build_object('success', true);
END;
$$;
