-- Migration: 20260916000010_late_check_in_penalty.sql
-- Description: Driver Workflow B Late Check-in Penalty Rules

-- 1. Check-In Audit Columns
ALTER TABLE public.driver_check_in_records 
ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS late_by_minutes INTEGER;

-- 2. Penalty Configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert initial late penalty amount of ₹20
INSERT INTO public.app_settings (key, value) VALUES ('late_check_in_penalty_amount', '20') ON CONFLICT DO NOTHING;

-- 3. Idempotency Constraint for Ledgers
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_late_penalty_per_shift 
ON public.driver_financial_ledger (source_reference_id) 
WHERE transaction_type = 'penalty' AND description = 'LATE_GIG_CHECK_IN';

-- 4. Update RPC
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
    v_late_minutes INTEGER;
    v_is_late BOOLEAN := false;
    v_penalty_text TEXT;
    v_penalty_amount NUMERIC;
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

    -- Expired Window
    IF v_late_minutes > 20 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'CHECK_IN_WINDOW_EXPIRED');
        RETURN jsonb_build_object('success', false, 'code', 'CHECK_IN_WINDOW_EXPIRED');
    END IF;

    -- Is Late?
    IF v_late_minutes > 0 AND v_late_minutes <= 20 THEN
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

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$$;
