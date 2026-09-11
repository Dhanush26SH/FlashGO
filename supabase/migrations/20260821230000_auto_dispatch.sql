-- Migration: 20260821230000_auto_dispatch.sql

-- 1. Modify claim_trip
CREATE OR REPLACE FUNCTION claim_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
BEGIN
    -- Lock driver to serialize assignments
    SELECT role, is_online INTO v_driver_role, v_is_online 
    FROM public.profiles 
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;

    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver % is not online', p_driver_id;
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips 
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit') AND id != p_trip_id
    ) THEN
        RAISE EXCEPTION 'Driver % already has an active trip', p_driver_id;
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

    -- Update trip (DO NOT update order status to out_for_delivery)
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = 'accepted',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync order driver_id only
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Modify reassign_trip
CREATE OR REPLACE FUNCTION reassign_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
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
        -- Lock driver
        SELECT role, is_online INTO v_driver_role, v_is_online 
        FROM public.profiles 
        WHERE id = p_driver_id
        FOR UPDATE;

        IF v_driver_role != 'driver' THEN
            RAISE EXCEPTION 'User % is not a driver', p_driver_id;
        END IF;

        IF v_is_online != true THEN
            RAISE EXCEPTION 'Driver % is not online', p_driver_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.logistics_trips 
            WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit') AND id != p_trip_id
        ) THEN
            RAISE EXCEPTION 'Driver % already has an active trip', p_driver_id;
        END IF;

        v_new_trip_status := 'accepted';
    END IF;

    -- Update trip (DO NOT update order status to out_for_delivery)
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = v_new_trip_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync order driver_id
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Create start_trip
CREATE OR REPLACE FUNCTION start_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip RECORD;
BEGIN
    -- Lock trip
    SELECT * INTO v_trip 
    FROM public.logistics_trips 
    WHERE id = p_trip_id 
    FOR UPDATE;

    IF v_trip.id IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.driver_id != p_driver_id THEN
        RAISE EXCEPTION 'Trip does not belong to this driver';
    END IF;

    IF v_trip.status != 'accepted' THEN
        RAISE EXCEPTION 'Trip must be in accepted status to start';
    END IF;

    -- Update trip status
    UPDATE public.logistics_trips
    SET status = 'in_transit',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Set associated non-cancelled orders to out_for_delivery
    UPDATE public.orders
    SET status = 'out_for_delivery',
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id AND status != 'cancelled';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Cancellation Integrity Trigger
CREATE OR REPLACE FUNCTION handle_order_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_remaining_orders INTEGER;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.trip_id IS NOT NULL THEN
        -- Lock trip
        PERFORM id FROM public.logistics_trips WHERE id = OLD.trip_id FOR UPDATE;
        
        -- Count other non-cancelled orders in the same trip
        SELECT COUNT(*) INTO v_remaining_orders
        FROM public.orders
        WHERE trip_id = OLD.trip_id AND status != 'cancelled' AND id != NEW.id;

        IF v_remaining_orders = 0 THEN
            UPDATE public.logistics_trips
            SET status = 'cancelled', updated_at = timezone('utc'::text, now())
            WHERE id = OLD.trip_id;
        END IF;

        -- Detach order from trip safely
        NEW.trip_id := NULL;
        NEW.driver_id := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_cancellation ON public.orders;
CREATE TRIGGER trigger_order_cancellation
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_order_cancellation();


-- 5. Auto Dispatch Trigger
CREATE OR REPLACE FUNCTION handle_auto_dispatch()
RETURNS TRIGGER AS $$
DECLARE
    v_driver_id UUID;
    v_trip_id UUID;
BEGIN
    IF NEW.status = 'packed' AND OLD.status != 'packed' AND NEW.trip_id IS NULL THEN
        -- 1. Try to find an eligible available driver (1-to-1 trip batching)
        SELECT id INTO v_driver_id FROM public.profiles 
        WHERE role = 'driver' AND is_online = true AND warehouse_id = NEW.warehouse_id
        AND id NOT IN (SELECT driver_id FROM public.logistics_trips WHERE status IN ('accepted', 'in_transit') AND driver_id IS NOT NULL)
        FOR UPDATE SKIP LOCKED LIMIT 1;

        -- 2. Create a logistics trip
        INSERT INTO public.logistics_trips (warehouse_id, status, driver_id)
        VALUES (NEW.warehouse_id, 
                CASE WHEN v_driver_id IS NOT NULL THEN 'accepted' ELSE 'pending' END, 
                v_driver_id)
        RETURNING id INTO v_trip_id;

        -- 3. Assign order to trip (order stays packed until start_trip)
        NEW.trip_id := v_trip_id;
        IF v_driver_id IS NOT NULL THEN
            NEW.driver_id := v_driver_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_dispatch ON public.orders;
CREATE TRIGGER trigger_auto_dispatch
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION handle_auto_dispatch();


-- 6. Driver Freed Queue Mechanism
CREATE OR REPLACE FUNCTION handle_driver_freed()
RETURNS TRIGGER AS $$
DECLARE
    v_pending_trip_id UUID;
BEGIN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled') AND NEW.driver_id IS NOT NULL THEN
        -- Ensure the freed driver is still online
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.driver_id AND is_online = true) THEN
            -- Find oldest pending trip for their warehouse
            SELECT id INTO v_pending_trip_id FROM public.logistics_trips
            WHERE warehouse_id = NEW.warehouse_id AND status = 'pending'
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED LIMIT 1;
            
            IF v_pending_trip_id IS NOT NULL THEN
                -- Auto assign the pending trip
                UPDATE public.logistics_trips
                SET driver_id = NEW.driver_id, status = 'accepted', updated_at = timezone('utc'::text, now())
                WHERE id = v_pending_trip_id;
                
                UPDATE public.orders
                SET driver_id = NEW.driver_id, updated_at = timezone('utc'::text, now())
                WHERE trip_id = v_pending_trip_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_freed ON public.logistics_trips;
CREATE TRIGGER trigger_driver_freed
    AFTER UPDATE ON public.logistics_trips
    FOR EACH ROW
    EXECUTE FUNCTION handle_driver_freed();
