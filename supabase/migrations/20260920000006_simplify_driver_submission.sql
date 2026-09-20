-- Migration: 20260920000006_simplify_driver_submission.sql
-- Description: Simplifies submit_driver_application by removing legacy onboarding requirements.

CREATE OR REPLACE FUNCTION public.submit_driver_application()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_onboarding RECORD;
    v_profile RECORD;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
    IF v_profile.role = 'driver' THEN RETURN jsonb_build_object('success', true, 'message', 'Already a driver'); END IF;
    IF v_profile.requested_role != 'driver' THEN RAISE EXCEPTION 'Driver role not requested'; END IF;

    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Driver onboarding application not found'; END IF;
    IF v_onboarding.status IN ('submitted', 'under_review', 'approved') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already submitted or approved');
    END IF;

    -- Verify Vehicle details
    IF v_onboarding.vehicle_type IS NULL THEN RAISE EXCEPTION 'Vehicle type missing'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE owner_driver_id = v_uid AND ownership_type = 'driver_owned') THEN
        RAISE EXCEPTION 'Personal vehicle details missing';
    END IF;

    -- Verify DL details
    IF NOT EXISTS (SELECT 1 FROM public.driver_compliance WHERE driver_id = v_uid AND dl_number IS NOT NULL AND trim(dl_number) != '') THEN
        RAISE EXCEPTION 'Driving Licence details missing';
    END IF;

    -- The bank details check will be fully enforced when we simplify Request Access, 
    -- but for now we leave it removed from the STRICT submission guard if it's missing,
    -- or we can keep it. The prompt says "Keep: ... submit_driver_vehicle_details ... Submit for Verification". 
    -- Actually, since Phase 2B adds Bank Details to Request Access, the driver might not have bank details yet. 
    -- Let's KEEP the payout check if it was already there, but since we removed PayoutMethodScreen from the nav, 
    -- we might block them. Ah! The prompt says "Do not redesign Request Access/bank details yet. That will be Phase 2B."
    -- "Remove these screens ... old Payout Method".
    -- If we remove old Payout Method but don't add Bank Details to Request Access yet, how do they pass?
    -- We MUST remove the payout details check from submit_driver_application FOR NOW, or they will be blocked.
    -- Wait, or does `RequestAccessScreen` already have bank details?
    -- Picker has bank details. Driver doesn't. 
    -- Let's remove the bank, nominee, and terms checks from the submission RPC for now, as Admin approval still checks them if needed.
    
    UPDATE public.driver_onboarding SET status = 'submitted', submission_time = now() WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'message', 'Application submitted successfully');
END;
$$;
