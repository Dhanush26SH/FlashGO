-- 1. Add authoritative flag to trips
ALTER TABLE public.logistics_trips ADD COLUMN IF NOT EXISTS demo_simulation_completed BOOLEAN DEFAULT false;

-- 2. Modify driver_set_demo_route_distance to use authoritative destination coords
DROP FUNCTION IF EXISTS public.driver_set_demo_route_distance(UUID, FLOAT);
DROP FUNCTION IF EXISTS public.driver_set_demo_route_distance(UUID, FLOAT, FLOAT, FLOAT);

CREATE OR REPLACE FUNCTION public.driver_set_demo_route_distance(p_trip_id UUID, p_distance_meters FLOAT)
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
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    IF p_distance_meters IS NULL OR p_distance_meters <= 0 OR p_distance_meters > 50000 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_DISTANCE');
    END IF;

    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;

    IF v_trip.status != 'in_transit' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRIP_STATUS');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver_id AND role = 'driver' AND is_suspended = false) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    -- Fetch the authoritative order destination coordinates
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id LIMIT 1;
    IF v_order.id IS NULL OR v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_DESTINATION');
    END IF;

    -- Update logistics_trips with the route distance AND the new authoritative demo flag
    UPDATE public.logistics_trips
    SET route_distance_meters = p_distance_meters,
        demo_simulation_completed = true,
        updated_at = NOW()
    WHERE id = p_trip_id;

    -- Securely update the driver's session telemetry using the exact order destination
    UPDATE public.driver_sessions
    SET latest_lat = v_order.delivery_lat,
        latest_lng = v_order.delivery_lng,
        updated_at = NOW()
    WHERE driver_id = v_driver_id AND status = 'active';

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Modify driver_mark_arrived to fetch from driver_sessions if demo_simulation_completed
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT);
DROP FUNCTION IF EXISTS public.driver_mark_arrived(UUID, FLOAT, FLOAT, DECIMAL);

CREATE OR REPLACE FUNCTION public.driver_mark_arrived(p_trip_id UUID, p_driver_lat FLOAT, p_driver_lng FLOAT)
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

    UPDATE public.logistics_trips 
    SET arrived_at = NOW(), 
        updated_at = NOW()
    WHERE id = p_trip_id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'driver_arrived', 'out_for_delivery', 'arrived', 'Driver arrived at delivery location', '{}'::jsonb, NULL);
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Update driver_get_active_delivery to return demo_simulation_completed
CREATE OR REPLACE FUNCTION public.driver_get_active_delivery()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_role TEXT;
    v_is_online BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_trip RECORD;
    v_result JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, is_online INTO v_role, v_is_online FROM public.profiles WHERE id = v_driver_id;
    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    SELECT lt.id, lt.status, lt.warehouse_id, lt.demo_simulation_completed
    INTO v_trip
    FROM public.logistics_trips lt
    WHERE lt.driver_id = v_driver_id AND lt.status IN ('accepted', 'in_transit')
    LIMIT 1;

    IF v_trip.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'trip', NULL);
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'trip', jsonb_build_object(
            'id', lt.id,
            'status', lt.status,
            'demo_simulation_completed', COALESCE(lt.demo_simulation_completed, false)
        ),
        'warehouse', jsonb_build_object(
            'id', w.id,
            'name', w.name,
            'address', w.address,
            'latitude', w.lat,
            'longitude', w.lng
        ),
        'order', jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'status', o.status,
            'total_amount', o.total_amount,
            'payment_method', o.payment_method,
            'payment_status', o.payment_status,
            'picker_name', COALESCE(picker.full_name, 'Assigning'),
            'customer_name', COALESCE(o.customer_snapshot_name, o.customer_name_snapshot, cust.full_name),
            'customer_phone', COALESCE(o.customer_snapshot_phone, cust.phone),
            'delivery_address', o.delivery_address,
            'delivery_lat', o.delivery_lat,
            'delivery_lng', o.delivery_lng,
            'picker_ready', (o.status = 'handed_off'),
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', oi.id,
                    'product_name', p.name,
                    'quantity', oi.quantity,
                    'price', oi.price
                ))
                FROM public.order_items oi
                JOIN public.products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
            ),
            'total_item_count', (
                SELECT SUM(oi.quantity)
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            )
        )
    ) INTO v_result
    FROM public.logistics_trips lt
    JOIN public.warehouses w ON w.id = lt.warehouse_id
    JOIN public.orders o ON o.trip_id = lt.id
    LEFT JOIN public.profiles picker ON picker.id = lt.picker_id
    LEFT JOIN public.profiles cust ON cust.id = o.customer_id
    WHERE lt.id = v_trip.id
    AND o.status NOT IN ('cancelled')
    LIMIT 1;

    IF v_result IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
    END IF;

    RETURN v_result;
END;
$$;
