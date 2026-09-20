-- Migration: 20260920000004_fix_driver_onboarding_vehicle_auth.sql
-- Description: Fixes submit_driver_vehicle_details authorization to allow pending Driver applicants.

CREATE OR REPLACE FUNCTION submit_driver_vehicle_details(p_vehicle_number TEXT, p_dl_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_normalized_vehicle TEXT;
    v_normalized_dl TEXT;
    v_existing_vehicle_id UUID;
    v_profile RECORD;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
    END IF;

    -- Fetch the full profile authorization state
    SELECT role, requested_role, is_pending_staff INTO v_profile 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Authorize if already an approved Driver, OR if legitimately onboarding as a Driver
    IF v_profile.role != 'driver' AND NOT (v_profile.is_pending_staff IS TRUE AND v_profile.requested_role = 'driver') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Validation & Normalization
    v_normalized_vehicle := upper(regexp_replace(p_vehicle_number, '\s+|-+', '', 'g'));
    v_normalized_dl := upper(trim(p_dl_number));

    IF v_normalized_vehicle = '' OR v_normalized_dl = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    -- Update or Insert Compliance for DL
    INSERT INTO public.driver_compliance (driver_id, dl_number, bg_check_status)
    VALUES (auth.uid(), v_normalized_dl, 'pending')
    ON CONFLICT (driver_id) DO UPDATE SET 
        dl_number = EXCLUDED.dl_number;

    -- Find if this driver already has a personal vehicle registered
    SELECT id INTO v_existing_vehicle_id FROM public.vehicles 
    WHERE owner_driver_id = auth.uid() AND ownership_type = 'driver_owned' LIMIT 1;

    IF v_existing_vehicle_id IS NOT NULL THEN
        -- Update existing personal vehicle
        UPDATE public.vehicles 
        SET license_plate = v_normalized_vehicle, 
            status = 'pending'
        WHERE id = v_existing_vehicle_id;
    ELSE
        -- Insert new personal vehicle
        INSERT INTO public.vehicles (license_plate, vehicle_type, ownership_type, owner_driver_id, warehouse_id, status)
        VALUES (v_normalized_vehicle, 'Personal', 'driver_owned', auth.uid(), NULL, 'pending');
    END IF;

    -- We explicitly DO NOT set current_vehicle_id here, Admin must approve it.

    RETURN jsonb_build_object('success', true);
END;
$$;
