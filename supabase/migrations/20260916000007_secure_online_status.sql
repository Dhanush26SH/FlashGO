-- Migration: 20260916000007_secure_online_status.sql
-- Description: Add app.driver_status_update_allowed protective trigger on profiles and strengthen claim_trip

-- 1. Protective Trigger on Profiles
CREATE OR REPLACE FUNCTION public.prevent_direct_is_online_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the transaction-local flag is set to true
    IF current_setting('app.driver_status_update_allowed', true) IS DISTINCT FROM 'true' THEN
        -- If not, and is_online is being changed, raise an exception
        IF NEW.is_online IS DISTINCT FROM OLD.is_online THEN
            RAISE EXCEPTION 'Direct updates to is_online are not allowed. Please use the check-in or break workflow.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_direct_is_online_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_direct_is_online_update();


-- 2. Strengthen claim_trip
CREATE OR REPLACE FUNCTION public.claim_trip(p_trip_id UUID, p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_end TIMESTAMPTZ;
BEGIN
    -- Lock driver to serialize assignments
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_driver_role, v_is_online, v_is_suspended
    FROM public.profiles
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;

    -- SUSPENSION CHECK
    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account % is suspended. Cannot claim trips.', p_driver_id;
    END IF;

    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver % is not online', p_driver_id;
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK (Workflow B Strengthening)
    SELECT id, staff_shift_id INTO v_session_id, v_shift_id
    FROM public.driver_sessions
    WHERE driver_id = p_driver_id AND status = 'active';

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'Driver % has no active operational session', p_driver_id;
    END IF;

    SELECT shift_end INTO v_shift_end
    FROM public.staff_shifts
    WHERE id = v_shift_id AND status = 'active';

    IF v_shift_end IS NULL THEN
        RAISE EXCEPTION 'Driver % has no active staff shift', p_driver_id;
    END IF;

    IF NOW() >= v_shift_end THEN
        RAISE EXCEPTION 'Driver % staff shift has expired', p_driver_id;
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
$$;
