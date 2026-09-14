-- Migration: 20260916000107_driver_eligibility_dispatch.sql
-- Description: Hardens run_dispatch_cycle driver concurrency and wires up check_in/resume dispatch.

-- 1. Replace run_dispatch_cycle with active offer guard and FOR UPDATE OF p SKIP LOCKED
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
BEGIN
    UPDATE public.driver_trip_offers dto
    SET status = 'expired', responded_at = NOW()
    FROM public.logistics_trips lt
    WHERE dto.trip_id = lt.id
      AND dto.status = 'offered'
      AND dto.expires_at <= NOW()
      AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id);

    FOR v_trip IN
        SELECT lt.id, lt.warehouse_id
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers active_dto
            ON active_dto.trip_id = lt.id AND active_dto.status = 'offered'
        WHERE lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND active_dto.id IS NULL
          AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id)
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        SELECT COUNT(*) INTO v_attempt_count FROM public.driver_trip_offers WHERE trip_id = v_trip.id;

        IF v_attempt_count >= 3 THEN
            UPDATE public.logistics_trips SET status = 'dispatch_failed', updated_at = NOW() WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_driver_id
        FROM public.profiles p
        JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
            AND ss.status = 'active'
            AND ss.warehouse_id = v_trip.warehouse_id
            AND ss.shift_end > NOW()
        WHERE p.role = 'driver'
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips busy
              WHERE busy.driver_id = p.id 
              AND (
                busy.status IN ('accepted', 'in_transit')
                OR (busy.status = 'completed' AND busy.completion_acknowledged_at IS NULL)
              )
          )
          -- NEW: Guard against multiple active offers
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers active_dto
              WHERE active_dto.driver_id = p.id
                AND active_dto.status = 'offered'
                AND active_dto.expires_at > NOW()
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers prev
              WHERE prev.trip_id = v_trip.id AND prev.driver_id = p.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_return_tasks drt
              WHERE drt.driver_id = p.id AND drt.status = 'required'
          )
        ORDER BY
            (SELECT MAX(lt2.updated_at)
             FROM public.logistics_trips lt2
             WHERE lt2.driver_id = p.id AND lt2.status IN ('completed', 'cancelled')
            ) ASC NULLS FIRST,
            ds.updated_at ASC -- FIXED: changed from ds.created_at to ds.updated_at
        FOR UPDATE OF p SKIP LOCKED -- NEW: Driver-side concurrency lock
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, NOW() + INTERVAL '60 seconds');
        END IF;
    END LOOP;
END;
$function$;

-- 2. Update driver_shift_check_in to dispatch at the end
CREATE OR REPLACE FUNCTION public.driver_shift_check_in(p_shift_id uuid, p_lat double precision, p_lng double precision, p_raw_qr_token text, p_selfie_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
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
    v_late_minutes INTEGER;
    v_is_late BOOLEAN := false;
    v_penalty_text TEXT;
    v_penalty_amount NUMERIC;
    v_driver_email TEXT;
    v_bypass_geofence BOOLEAN := false;
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
    
    -- Fetch driver email directly from auth.users (allowed via SECURITY DEFINER)
    SELECT email INTO v_driver_email FROM auth.users WHERE id = auth.uid();
    
    -- Check for DEVELOPMENT ONLY bypass exception
    SELECT bypass_geofence INTO v_bypass_geofence 
    FROM public.dev_test_accounts 
    WHERE email = v_driver_email;

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

    -- Time Eligibility (Early Window is 30 mins before shift)
    IF NOW() < (v_shift_start - interval '30 minutes') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'TOO_EARLY');
        RETURN jsonb_build_object('success', false, 'code', 'TOO_EARLY');
    END IF;

    -- Late minutes calculation (Database Time)
    IF NOW() > v_shift_start THEN
        v_late_minutes := CEIL(EXTRACT(EPOCH FROM (NOW() - v_shift_start)) / 60.0);
    ELSE
        v_late_minutes := 0;
    END IF;

    -- Expired Window (Gig ended)
    IF NOW() >= v_shift_end THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'CHECK_IN_WINDOW_EXPIRED');
        RETURN jsonb_build_object('success', false, 'code', 'CHECK_IN_WINDOW_EXPIRED');
    END IF;

    -- Is Late?
    IF v_late_minutes > 0 THEN
        v_is_late := true;
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

    -- Apply the bypass ONLY if distance fails but v_bypass_geofence is true
    IF v_distance > 200 AND NOT COALESCE(v_bypass_geofence, false) THEN
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

    -- ALWAYS record the REAL v_distance here, even if bypassed
    INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, qr_challenge_id, status, is_late, late_by_minutes)
    VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, v_qr_id, 'SUCCESS', v_is_late, v_late_minutes);

    -- Apply Penalty if Late
    IF v_is_late THEN
        BEGIN
            SELECT value INTO v_penalty_text FROM public.app_settings WHERE key = 'late_check_in_penalty_amount';
            IF v_penalty_text IS NOT NULL THEN
                v_penalty_amount := v_penalty_text::NUMERIC;
            ELSE
                v_penalty_amount := 0;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Sane fallback to 0 penalty, do not break the physical check-in because of a bad config string
            v_penalty_amount := 0;
        END;

        -- Ensure it's never negative (which would become positive earnings below)
        IF v_penalty_amount > 0 THEN
            INSERT INTO public.driver_financial_ledger (
                driver_id, amount, transaction_type, source_reference_id, description, created_by
            ) VALUES (
                auth.uid(), -v_penalty_amount, 'penalty', p_shift_id, 'LATE_GIG_CHECK_IN', NULL
            ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'penalty' AND description = 'LATE_GIG_CHECK_IN' DO NOTHING;
        END IF;
    END IF;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    -- NEW: Run dispatch now that Driver is fully eligible
    PERFORM public.run_dispatch_cycle(v_shift_wh);

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$function$;

-- 3. Update driver_toggle_break_status to dispatch on resume
CREATE OR REPLACE FUNCTION public.driver_toggle_break_status(p_is_online boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_status TEXT;
    v_shift_end TIMESTAMPTZ;
    v_shift_wh UUID; -- NEW: track warehouse
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

        -- MODIFIED: added warehouse_id
        SELECT status, shift_end, warehouse_id INTO v_shift_status, v_shift_end, v_shift_wh
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

    -- NEW: Trigger dispatch if driver came online
    IF p_is_online = true THEN
        PERFORM public.run_dispatch_cycle(v_shift_wh);
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$function$;
