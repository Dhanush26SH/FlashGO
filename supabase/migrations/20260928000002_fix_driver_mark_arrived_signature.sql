-- Fix driver_mark_arrived signature to match frontend (4 arguments)
-- Preserves Demo-arrival security logic from 20260928000001_trip_scoped_demo_state.sql

-- 1. Drop existing conflicting signatures
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT);
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT, DECIMAL);

-- 2. Create the correct 4-argument signature
CREATE OR REPLACE FUNCTION public.driver_mark_arrived(p_trip_id UUID, p_driver_lat FLOAT, p_driver_lng FLOAT, p_route_distance_meters DECIMAL DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_distance_meters FLOAT;
    v_calc_lat FLOAT := p_driver_lat;
    v_calc_lng FLOAT := p_driver_lng;
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.status != 'in_transit' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_IN_TRANSIT');
    END IF;
    IF v_trip.arrived_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ARRIVED');
    END IF;

    -- Get first order authoritative details securely tied to this trip
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ORDER');
    END IF;

    -- If simulation is completed, securely override frontend-provided GPS directly with authoritative order coordinates
    IF v_trip.demo_simulation_completed = true THEN
        IF v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_DESTINATION');
        END IF;
        v_calc_lat := v_order.delivery_lat;
        v_calc_lng := v_order.delivery_lng;
    END IF;

    IF v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
         v_distance_meters := 0;
    ELSE
         -- Distance calculation stays intact. Uses strictly order coordinates if Demo, or frontend GPS if Normal.
         v_distance_meters := public.calculate_haversine_distance(v_calc_lat, v_calc_lng, v_order.delivery_lat, v_order.delivery_lng);
         
         IF v_distance_meters > 150 THEN
             RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR', 'distance_meters', v_distance_meters);
         END IF;
    END IF;

    -- Update logistics_trips.
    -- If demo_simulation_completed is true, we preserve the authoritative route_distance_meters set by the demo completion RPC.
    -- Otherwise, we accept the client's p_route_distance_meters if provided.
    UPDATE public.logistics_trips 
    SET arrived_at = NOW(),
        route_distance_meters = CASE 
            WHEN demo_simulation_completed = true THEN route_distance_meters
            ELSE COALESCE(p_route_distance_meters, route_distance_meters)
        END,
        updated_at = NOW()
    WHERE id = p_trip_id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'driver_arrived', 'out_for_delivery', 'arrived', 'Driver arrived at delivery location', '{}'::jsonb, NULL);
    
    RETURN jsonb_build_object('success', true);
END;
$$;
