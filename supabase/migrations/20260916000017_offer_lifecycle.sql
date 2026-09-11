-- Migration: 20260916000017_offer_lifecycle.sql
-- Description: Adds explicit offer lifecycle to logistics_trips, strengthens claim_trip, adds read-only secure feed RPC, and idempotent dispatch.

-- 1. Add offer lifecycle columns
ALTER TABLE public.logistics_trips 
ADD COLUMN IF NOT EXISTS offered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_offer_at TIMESTAMPTZ;

-- 2. Idempotent Dispatch RPC
-- Called to safely initiate an offer window for eligible trips
CREATE OR REPLACE FUNCTION public.dispatch_trip_offers(p_warehouse_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_id UUID;
BEGIN
    -- Find a pending trip that is ready for a new offer cycle
    FOR v_trip_id IN 
        SELECT id FROM public.logistics_trips
        WHERE warehouse_id = p_warehouse_id 
          AND status = 'pending' 
          AND driver_id IS NULL
          AND (next_offer_at IS NULL OR NOW() >= next_offer_at)
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Safely start the offer cycle: 60s offer, 90s cooldown
        UPDATE public.logistics_trips
        SET offered_at = NOW(),
            offer_expires_at = NOW() + INTERVAL '60 seconds',
            next_offer_at = NOW() + INTERVAL '90 seconds'
        WHERE id = v_trip_id;
    END LOOP;
END;
$$;

-- 3. Secure Read-Only Driver Operations Feed
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

    -- If online, look for a valid pending offer
    IF v_is_online THEN
        SELECT jsonb_build_object(
            'id', lt.id,
            'status', lt.status,
            'offered_at', lt.offered_at,
            'offer_expires_at', lt.offer_expires_at,
            'warehouse_id', w.id,
            'warehouse_name', w.name,
            'warehouse_address', w.address,
            'order_id', o.id,
            'order_number', o.order_number,
            'picker_name', COALESCE(p.full_name, 'Assigning')
        ) INTO v_pending_offer
        FROM public.logistics_trips lt
        JOIN public.warehouses w ON lt.warehouse_id = w.id
        LEFT JOIN public.orders o ON o.trip_id = lt.id
        LEFT JOIN public.profiles p ON o.picker_id = p.id
        WHERE lt.warehouse_id = v_warehouse_id
          AND lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND lt.offered_at IS NOT NULL
          AND lt.offer_expires_at IS NOT NULL
          AND NOW() < lt.offer_expires_at
        ORDER BY lt.offered_at ASC
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

-- 4. Strengthen claim_trip
CREATE OR REPLACE FUNCTION public.claim_trip(p_trip_id UUID, p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_status TEXT;
    v_trip_expires_at TIMESTAMPTZ;
    v_trip_warehouse_id UUID;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_shift_warehouse_id UUID;
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
        RAISE EXCEPTION 'Driver account % is suspended. Cannot claim trips.', p_driver_id;
    END IF;

    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver % is not online', p_driver_id;
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK
    SELECT ds.id, ds.staff_shift_id, ss.shift_end, ss.warehouse_id 
    INTO v_session_id, v_shift_id, v_shift_end, v_shift_warehouse_id
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = p_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RAISE EXCEPTION 'Driver % has no active operational session', p_driver_id;
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit') AND id != p_trip_id
    ) THEN
        RAISE EXCEPTION 'Driver % already has an active trip', p_driver_id;
    END IF;

    -- Lock trip FOR UPDATE to prevent race conditions
    SELECT status, offer_expires_at, warehouse_id 
    INTO v_trip_status, v_trip_expires_at, v_trip_warehouse_id
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip_warehouse_id != v_shift_warehouse_id THEN
        RAISE EXCEPTION 'Trip belongs to a different warehouse';
    END IF;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or in transit';
    END IF;

    -- Strictly enforce offer expiration
    IF v_trip_expires_at IS NULL OR NOW() >= v_trip_expires_at THEN
        RAISE EXCEPTION 'EXPIRED_OFFER';
    END IF;

    -- Update trip 
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
