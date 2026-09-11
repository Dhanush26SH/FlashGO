-- Migration: 20260916000006_driver_workflow_b_rpcs.sql
-- Description: RPCs for generating QR, check-in, and toggle break status

-- Helper to generate a random cryptographically secure string (requires pg_crypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Generate QR Challenge
CREATE OR REPLACE FUNCTION public.get_or_create_current_warehouse_qr(p_warehouse_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role TEXT;
    v_admin_wh UUID;
    v_existing_token TEXT;
    v_new_token TEXT;
    v_lock_key INT;
BEGIN
    -- Validate auth.uid()
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, warehouse_id INTO v_admin_role, v_admin_wh
    FROM public.profiles WHERE id = auth.uid();

    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Access denied: not an admin';
    END IF;

    IF v_admin_wh IS NOT NULL AND v_admin_wh != p_warehouse_id THEN
        RAISE EXCEPTION 'Access denied: unauthorized warehouse';
    END IF;

    -- Concurrency Protection: Advisory lock keyed by warehouse_id
    v_lock_key := left(md5(p_warehouse_id::text), 8)::bit(32)::int;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Check for valid existing challenge (>5 seconds remaining)
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = p_warehouse_id
      AND expires_at > (NOW() + interval '5 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NOT NULL THEN
        RETURN v_existing_token;
    END IF;

    -- Generate new token
    v_new_token := encode(gen_random_bytes(16), 'hex');
    
    INSERT INTO public.warehouse_qr_challenges (warehouse_id, raw_token, expires_at)
    VALUES (p_warehouse_id, v_new_token, NOW() + interval '60 seconds');

    RETURN v_new_token;
END;
$$;


-- 2. Driver Check-In
CREATE OR REPLACE FUNCTION public.driver_shift_check_in(
    p_shift_id UUID, p_lat FLOAT, p_lng FLOAT, p_raw_qr_token TEXT, p_selfie_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_driver_role TEXT;
    v_driver_suspended BOOLEAN;
    v_shift_staff_id UUID;
    v_shift_status TEXT;
    v_shift_wh UUID;
    v_shift_start TIMESTAMPTZ;
    v_shift_end TIMESTAMPTZ;
    v_wh_lat FLOAT;
    v_wh_lng FLOAT;
    v_distance FLOAT;
    v_qr_id UUID;
    v_selfie_created_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify driver
    SELECT role, is_suspended INTO v_driver_role, v_driver_suspended
    FROM public.profiles WHERE id = auth.uid();
    
    IF v_driver_role != 'driver' OR v_driver_suspended = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    -- Shift Lock and Verify
    SELECT staff_id, status, warehouse_id, shift_start, shift_end
    INTO v_shift_staff_id, v_shift_status, v_shift_wh, v_shift_start, v_shift_end
    FROM public.staff_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_FOUND');
    END IF;

    IF v_shift_staff_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_OWNED');
    END IF;

    IF v_shift_status != 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_SCHEDULED');
    END IF;

    -- Check for duplicate success
    IF EXISTS (
        SELECT 1 FROM public.driver_check_in_records
        WHERE driver_id = auth.uid() AND staff_shift_id = p_shift_id AND status = 'SUCCESS'
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN');
    END IF;

    -- Time Eligibility
    IF NOW() < (v_shift_start - interval '30 minutes') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'TOO_EARLY');
        RETURN jsonb_build_object('success', false, 'code', 'TOO_EARLY');
    END IF;

    IF NOW() > (v_shift_start + interval '30 minutes') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'CHECK_IN_WINDOW_EXPIRED');
        RETURN jsonb_build_object('success', false, 'code', 'CHECK_IN_WINDOW_EXPIRED');
    END IF;

    -- Geofence Validation
    SELECT lat, lng INTO v_wh_lat, v_wh_lng
    FROM public.warehouses WHERE id = v_shift_wh;

    IF v_wh_lat IS NULL OR v_wh_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
    END IF;

    v_distance := public.calculate_haversine_distance(p_lat, p_lng, v_wh_lat, v_wh_lng);

    IF v_distance > 200 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, 'FAILED', 'OUTSIDE_WAREHOUSE_GEOFENCE');
        RETURN jsonb_build_object('success', false, 'code', 'OUTSIDE_WAREHOUSE_GEOFENCE');
    END IF;

    -- QR Validation
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift_wh AND raw_token = p_raw_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, 'FAILED', 'INVALID_QR_TOKEN');
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    -- Selfie Evidence Freshness
    SELECT created_at INTO v_selfie_created_at
    FROM storage.objects
    WHERE bucket_id = 'driver_check_ins' AND name = p_selfie_path;

    IF v_selfie_created_at IS NULL OR v_selfie_created_at < (NOW() - interval '5 minutes') OR p_selfie_path NOT LIKE (auth.uid() || '/' || p_shift_id || '/%') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, qr_challenge_id, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, v_qr_id, 'FAILED', 'INVALID_SELFIE_EVIDENCE');
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_SELFIE_EVIDENCE');
    END IF;

    -- Atomic Success Transitions
    UPDATE public.staff_shifts SET status = 'active' WHERE id = p_shift_id;
    
    INSERT INTO public.driver_sessions (driver_id, status, latest_lat, latest_lng, staff_shift_id, updated_at)
    VALUES (auth.uid(), 'active', p_lat, p_lng, p_shift_id, NOW())
    ON CONFLICT (driver_id) WHERE status = 'active'
    DO UPDATE SET staff_shift_id = p_shift_id, latest_lat = p_lat, latest_lng = p_lng, updated_at = NOW();

    INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, qr_challenge_id, status)
    VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, v_qr_id, 'SUCCESS');

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$$;


-- 3. Toggle Break Status
CREATE OR REPLACE FUNCTION public.driver_toggle_break_status(p_is_online BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_status TEXT;
    v_shift_end TIMESTAMPTZ;
    v_driver_role TEXT;
    v_driver_suspended BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify driver
    SELECT role, is_suspended INTO v_driver_role, v_driver_suspended
    FROM public.profiles WHERE id = auth.uid();
    
    IF v_driver_role != 'driver' OR v_driver_suspended = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    IF p_is_online = false THEN
        -- Check for active deliveries
        IF EXISTS (
            SELECT 1 FROM public.logistics_trips 
            WHERE driver_id = auth.uid() AND status IN ('accepted', 'in_transit')
        ) THEN
            RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_DELIVERY_IN_PROGRESS');
        END IF;
    ELSE
        -- Resume Online validation
        SELECT id, staff_shift_id INTO v_session_id, v_shift_id
        FROM public.driver_sessions 
        WHERE driver_id = auth.uid() AND status = 'active';

        IF v_session_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
        END IF;

        SELECT status, shift_end INTO v_shift_status, v_shift_end
        FROM public.staff_shifts WHERE id = v_shift_id;

        IF v_shift_status != 'active' THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_ACTIVE');
        END IF;

        IF NOW() >= v_shift_end THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_EXPIRED');
        END IF;
    END IF;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = p_is_online WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$$;


-- 4. End Shift
CREATE OR REPLACE FUNCTION public.driver_end_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id UUID;
    v_driver_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Check for active deliveries
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips 
        WHERE driver_id = auth.uid() AND status IN ('accepted', 'in_transit')
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_DELIVERY_IN_PROGRESS');
    END IF;

    -- Session Lock
    SELECT id INTO v_session_id
    FROM public.driver_sessions
    WHERE driver_id = auth.uid() AND staff_shift_id = p_shift_id AND status = 'active'
    FOR UPDATE;

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    UPDATE public.driver_sessions SET status = 'completed', updated_at = NOW() WHERE id = v_session_id;
    UPDATE public.staff_shifts SET status = 'completed' WHERE id = p_shift_id;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = false WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$$;
