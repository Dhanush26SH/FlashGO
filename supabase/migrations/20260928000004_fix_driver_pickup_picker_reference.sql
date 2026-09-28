-- Fix bad alias reference to picker_id introduced in 000001
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
    LEFT JOIN public.profiles picker ON picker.id = o.picker_id
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
