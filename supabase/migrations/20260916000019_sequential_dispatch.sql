-- Migration: 20260916000019_sequential_dispatch.sql
-- Description: Implement sequential 1-by-1 driver dispatch with driver_trip_offers

-- 1. Create driver_trip_offers table
CREATE TABLE IF NOT EXISTS public.driver_trip_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    attempt_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'expired', 'rejected', 'cancelled')),
    offered_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    UNIQUE(trip_id, driver_id)
);

CREATE UNIQUE INDEX idx_single_active_offer ON public.driver_trip_offers(trip_id) WHERE status = 'offered';

ALTER TABLE public.driver_trip_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers can view own offers" ON public.driver_trip_offers
FOR SELECT USING (auth.uid() = driver_id);
-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_trip_offers;

-- Add dispatch_failed to logistics_trips status check (We have to drop and recreate the constraint)
ALTER TABLE public.logistics_trips DROP CONSTRAINT IF EXISTS logistics_trips_status_check;
ALTER TABLE public.logistics_trips ADD CONSTRAINT logistics_trips_status_check CHECK (status IN ('pending', 'accepted', 'in_transit', 'completed', 'cancelled', 'dispatch_failed'));

-- 2. Dispatch Trip Offers
CREATE OR REPLACE FUNCTION public.dispatch_trip_offers(p_warehouse_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
BEGIN
    -- First, expire any old active offers
    UPDATE public.driver_trip_offers
    SET status = 'expired', responded_at = NOW()
    WHERE expires_at <= NOW() AND status = 'offered'
    AND trip_id IN (SELECT id FROM public.logistics_trips WHERE warehouse_id = p_warehouse_id);

    -- Loop through pending trips that don't have an active offer
    FOR v_trip IN 
        SELECT lt.id 
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers dto ON dto.trip_id = lt.id AND dto.status = 'offered'
        WHERE lt.warehouse_id = p_warehouse_id 
          AND lt.status = 'pending' 
          AND lt.driver_id IS NULL
          AND dto.id IS NULL
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        -- Count past attempts
        SELECT COUNT(*) INTO v_attempt_count
        FROM public.driver_trip_offers
        WHERE trip_id = v_trip.id;

        IF v_attempt_count >= 3 THEN
            -- Max attempts reached, mark dispatch failed
            UPDATE public.logistics_trips SET status = 'dispatch_failed' WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        -- Find an eligible driver
        -- Must be online, driver, active session at this warehouse, not busy
        SELECT p.id INTO v_driver_id
        FROM public.profiles p
        JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id AND ss.status = 'active'
        WHERE p.role = 'driver'
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND ss.warehouse_id = p_warehouse_id
          AND ss.shift_end > NOW()
          -- Not already attempted for this trip
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers dto WHERE dto.trip_id = v_trip.id AND dto.driver_id = p.id
          )
          -- Not currently on an active trip
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips active_lt 
              WHERE active_lt.driver_id = p.id AND active_lt.status IN ('accepted', 'in_transit')
          )
        ORDER BY ds.created_at ASC -- simple deterministic fair ordering
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            -- Insert new offer
            INSERT INTO public.driver_trip_offers(trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, NOW() + INTERVAL '60 seconds');
        END IF;
    END LOOP;
END;
$$;

-- 3. Secure Read-Only Feed
CREATE OR REPLACE FUNCTION public.get_driver_operations_feed()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_session_id UUID;
    v_shift_id UUID;
    v_warehouse_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_role TEXT;
    
    v_active_trip JSONB;
    v_pending_offer JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Expire any naturally expired offers for this driver first (clean up)
    UPDATE public.driver_trip_offers
    SET status = 'expired', responded_at = NOW()
    WHERE driver_id = v_driver_id AND status = 'offered' AND expires_at <= NOW();

    -- Fetch driver state
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_role, v_is_online, v_is_suspended
    FROM public.profiles WHERE id = v_driver_id;

    IF v_role != 'driver' OR v_is_suspended = TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'INELIGIBLE');
    END IF;

    -- Fetch active session and warehouse
    SELECT ds.id, ss.id, ss.warehouse_id, ss.shift_end
    INTO v_session_id, v_shift_id, v_warehouse_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Check for Active Trip first
    SELECT jsonb_build_object(
        'id', lt.id,
        'status', lt.status
    ) INTO v_active_trip
    FROM public.logistics_trips lt
    WHERE lt.driver_id = v_driver_id AND lt.status IN ('accepted', 'in_transit')
    LIMIT 1;

    IF v_active_trip IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'server_now', NOW(),
            'active_trip', v_active_trip,
            'pending_offer', NULL
        );
    END IF;

    -- If online, look for an active offer targeting THIS specific driver
    IF v_is_online THEN
        SELECT jsonb_build_object(
            'id', lt.id,
            'status', lt.status,
            'offered_at', dto.offered_at,
            'offer_expires_at', dto.expires_at,
            'warehouse_id', w.id,
            'warehouse_name', w.name,
            'warehouse_address', w.address,
            'order_id', o.id,
            'order_number', o.order_number,
            'picker_name', COALESCE(p.full_name, 'Assigning')
        ) INTO v_pending_offer
        FROM public.driver_trip_offers dto
        JOIN public.logistics_trips lt ON dto.trip_id = lt.id
        JOIN public.warehouses w ON lt.warehouse_id = w.id
        LEFT JOIN public.orders o ON o.trip_id = lt.id
        LEFT JOIN public.profiles p ON o.picker_id = p.id
        WHERE dto.driver_id = v_driver_id
          AND dto.status = 'offered'
          AND dto.expires_at > NOW()
          AND lt.status = 'pending'
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'server_now', NOW(),
        'active_trip', NULL,
        'pending_offer', v_pending_offer
    );
END;
$$;

-- 4. Atomic claim_trip
CREATE OR REPLACE FUNCTION public.claim_trip(p_trip_id UUID, p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offer_id UUID;
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
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
    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account is suspended';
    END IF;
    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver is not online';
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = p_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RAISE EXCEPTION 'No active operational session';
    END IF;

    -- Lock the specific offer
    SELECT id INTO v_offer_id
    FROM public.driver_trip_offers
    WHERE trip_id = p_trip_id AND driver_id = p_driver_id AND status = 'offered' AND expires_at > NOW()
    FOR UPDATE;

    IF v_offer_id IS NULL THEN
        RAISE EXCEPTION 'EXPIRED_OFFER';
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'Driver already has an active trip';
    END IF;

    -- Lock trip FOR UPDATE
    SELECT status INTO v_trip_status
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or no longer pending';
    END IF;

    -- Mark offer accepted
    UPDATE public.driver_trip_offers
    SET status = 'accepted', responded_at = NOW()
    WHERE id = v_offer_id;

    -- Update trip 
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_trip_id;

    -- Sync order driver_id
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = NOW()
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$;
