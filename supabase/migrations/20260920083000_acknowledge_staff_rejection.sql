-- Migration: 20260920083000_acknowledge_staff_rejection.sql
-- Description: RPC to allow an authenticated applicant to acknowledge their own rejection and clear their pending status so they can reapply.

CREATE OR REPLACE FUNCTION public.acknowledge_staff_rejection()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_onboarding RECORD;
BEGIN
    -- Verify the caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: must be authenticated';
    END IF;

    -- Lock the caller's profile
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    -- Verify authoritative profile state
    IF v_profile.role != 'customer' THEN
        RAISE EXCEPTION 'Invalid role: must be customer to acknowledge rejection';
    END IF;
    IF v_profile.is_pending_staff != true THEN
        RAISE EXCEPTION 'Invalid state: must be pending staff to acknowledge rejection';
    END IF;
    IF v_profile.requested_role != 'driver' THEN
        RAISE EXCEPTION 'Invalid requested role: this endpoint is currently for rejected drivers';
    END IF;

    -- Verify the caller has a rejected driver_onboarding row
    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver onboarding record not found';
    END IF;
    IF v_onboarding.status != 'rejected' THEN
        RAISE EXCEPTION 'Cannot acknowledge: driver application is not rejected';
    END IF;

    -- Temporarily bypass the protect_sensitive_profile_fields trigger
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    -- Clear the pending status to route the user back to Request Access
    UPDATE public.profiles
    SET 
        is_pending_staff = false,
        requested_role = NULL
    WHERE id = auth.uid();
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.acknowledge_staff_rejection() TO authenticated;
