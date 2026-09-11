-- Migration: Fix Live Driver Submission Training Requirement
-- Replaces the submit_driver_application() RPC to remove training verification checks securely on the live DB.

CREATE OR REPLACE FUNCTION public.submit_driver_application()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_onboarding RECORD;
    v_profile RECORD;
    v_warehouse RECORD;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Fetch profile
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    IF v_profile.role = 'driver' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already a driver');
    END IF;

    IF v_profile.requested_role != 'driver' THEN
        RAISE EXCEPTION 'Driver role not requested';
    END IF;

    -- Fetch onboarding
    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver onboarding application not found';
    END IF;

    IF v_onboarding.status IN ('submitted', 'under_review', 'approved') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already submitted or approved');
    END IF;

    -- Verify fields
    IF v_onboarding.language_pref IS NULL THEN RAISE EXCEPTION 'Language preference missing'; END IF;
    IF v_onboarding.vehicle_type IS NULL THEN RAISE EXCEPTION 'Vehicle type missing'; END IF;
    IF v_onboarding.work_area IS NULL THEN RAISE EXCEPTION 'Work area missing'; END IF;
    IF v_onboarding.work_type IS NULL THEN RAISE EXCEPTION 'Work type missing'; END IF;
    IF v_onboarding.warehouse_id IS NULL THEN RAISE EXCEPTION 'Warehouse missing'; END IF;
    IF v_onboarding.selfie_url IS NULL THEN RAISE EXCEPTION 'Selfie missing'; END IF;

    -- Verify warehouse
    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_onboarding.warehouse_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or inactive warehouse';
    END IF;

    IF v_warehouse.work_area != v_onboarding.work_area THEN
        RAISE EXCEPTION 'Warehouse work area does not match selected work area';
    END IF;

    -- Verify related records
    IF NOT EXISTS (SELECT 1 FROM public.driver_payout_details WHERE driver_id = v_uid) THEN
        RAISE EXCEPTION 'Payout details missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.driver_nominee_details WHERE driver_id = v_uid) THEN
        RAISE EXCEPTION 'Nominee details missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.driver_agreement_acceptances WHERE driver_id = v_uid) THEN
        RAISE EXCEPTION 'Terms agreement missing';
    END IF;

    -- NOTE: Driver training validation has been successfully and deliberately removed from this live RPC.
    -- NOTE: Fee check goes here if a fee configuration is implemented in the future.

    -- Update onboarding status
    UPDATE public.driver_onboarding 
    SET status = 'submitted', submission_time = now() 
    WHERE id = v_uid;

    RETURN jsonb_build_object('success', true, 'message', 'Application submitted successfully');
END;
$$;
