-- Migration: 20260814000008_atomic_logistics_rpcs.sql

-- 1. create_logistics_trip
CREATE OR REPLACE FUNCTION create_logistics_trip(
    p_warehouse_id UUID,
    p_order_ids UUID[]
) RETURNS UUID AS $$
DECLARE
    v_trip_id UUID;
    v_order_record RECORD;
    v_seq INTEGER := 1;
BEGIN
    -- Verify array is not empty
    IF array_length(p_order_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Order IDs array cannot be empty';
    END IF;

    -- Lock the orders in a consistent order to prevent deadlocks
    -- Wait, we can lock them all at once.
    -- However, we must ensure they all belong to the warehouse, are 'packed', and have no trip.
    FOR v_order_record IN 
        SELECT id, status, warehouse_id, trip_id 
        FROM public.orders 
        WHERE id = ANY(p_order_ids)
        ORDER BY id
        FOR UPDATE
    LOOP
        IF v_order_record.warehouse_id != p_warehouse_id THEN
            RAISE EXCEPTION 'Order % does not belong to warehouse %', v_order_record.id, p_warehouse_id;
        END IF;
        IF v_order_record.status != 'packed' THEN
            RAISE EXCEPTION 'Order % is not in packed status', v_order_record.id;
        END IF;
        IF v_order_record.trip_id IS NOT NULL THEN
            RAISE EXCEPTION 'Order % is already assigned to a trip', v_order_record.id;
        END IF;
    END LOOP;

    -- Create trip
    INSERT INTO public.logistics_trips (warehouse_id, status)
    VALUES (p_warehouse_id, 'pending')
    RETURNING id INTO v_trip_id;

    -- Update orders with trip_id and deterministic sequence
    FOR i IN 1 .. array_length(p_order_ids, 1) LOOP
        UPDATE public.orders
        SET trip_id = v_trip_id,
            delivery_sequence = i
        WHERE id = p_order_ids[i];
    END LOOP;

    RETURN v_trip_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. claim_trip
CREATE OR REPLACE FUNCTION claim_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
BEGIN
    -- Verify driver
    SELECT role INTO v_driver_role FROM public.profiles WHERE id = p_driver_id;
    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;

    -- Lock trip
    SELECT status INTO v_trip_status 
    FROM public.logistics_trips 
    WHERE id = p_trip_id 
    FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or in transit';
    END IF;

    -- Update trip
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = 'accepted',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync orders
    UPDATE public.orders
    SET driver_id = p_driver_id,
        status = 'out_for_delivery',
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. reassign_trip
CREATE OR REPLACE FUNCTION reassign_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_new_trip_status TEXT := 'pending';
BEGIN
    -- Lock trip
    SELECT status INTO v_trip_status 
    FROM public.logistics_trips 
    WHERE id = p_trip_id 
    FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot reassign a completed or cancelled trip';
    END IF;

    IF p_driver_id IS NOT NULL THEN
        SELECT role INTO v_driver_role FROM public.profiles WHERE id = p_driver_id;
        IF v_driver_role != 'driver' THEN
            RAISE EXCEPTION 'User % is not a driver', p_driver_id;
        END IF;
        v_new_trip_status := 'accepted';
    END IF;

    -- Update trip
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = v_new_trip_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync orders
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. mark_order_delivered
CREATE OR REPLACE FUNCTION mark_order_delivered(
    p_order_id UUID,
    p_otp VARCHAR,
    p_driver_id UUID,
    p_pod_url TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_order RECORD;
    v_trip_id UUID;
    v_undelivered_count INTEGER;
BEGIN
    -- Lock order
    SELECT id, status, driver_id, otp_code, total_amount, payment_method, trip_id 
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status != 'out_for_delivery' THEN
        RAISE EXCEPTION 'Order is not out for delivery';
    END IF;

    IF v_order.driver_id != p_driver_id THEN
        RAISE EXCEPTION 'Order is not assigned to this driver';
    END IF;

    IF v_order.otp_code != p_otp THEN
        RAISE EXCEPTION 'Invalid OTP';
    END IF;

    -- 1. Update order
    UPDATE public.orders
    SET status = 'delivered',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    -- 2. Insert Driver Earnings
    INSERT INTO public.driver_earnings (driver_id, order_id, earning_amount, commission_amount)
    VALUES (p_driver_id, p_order_id, 7.00, 1.50);

    -- 3. Register COD if needed
    IF v_order.payment_method = 'cod' THEN
        PERFORM public.register_cod_delivery(p_order_id, p_driver_id, v_order.total_amount);
    END IF;

    -- 4. Check if trip is completed
    v_trip_id := v_order.trip_id;
    IF v_trip_id IS NOT NULL THEN
        -- Lock trip to prevent race conditions during concurrent order completions
        PERFORM id FROM public.logistics_trips WHERE id = v_trip_id FOR UPDATE;

        SELECT COUNT(*) INTO v_undelivered_count 
        FROM public.orders 
        WHERE trip_id = v_trip_id 
        AND status != 'delivered' AND status != 'cancelled';

        IF v_undelivered_count = 0 THEN
            UPDATE public.logistics_trips 
            SET status = 'completed',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_trip_id;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
