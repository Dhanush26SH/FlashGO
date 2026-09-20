-- Update request_staff_access to force driver onboarding restart
CREATE OR REPLACE FUNCTION public.request_staff_access(
    p_full_name TEXT,
    p_requested_role public.user_role,
    p_phone TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow requesting valid staff roles
    IF p_requested_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid requested role. Must be picker, driver, or warehouse_staff.';
    END IF;

    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    -- Update the calling user's profile
    UPDATE public.profiles
    SET 
        full_name = p_full_name,
        requested_role = p_requested_role,
        is_pending_staff = TRUE,
        phone = COALESCE(p_phone, phone)
    WHERE id = auth.uid() 
      AND role = 'customer'; -- Ensure they haven't already been granted a staff role

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found or you are already a staff member.';
    END IF;

    -- If this is a driver re-application, forcibly reset the onboarding state
    -- to ensure they physically walk through the simplified onboarding screens again.
    IF p_requested_role = 'driver' THEN
        UPDATE public.driver_onboarding
        SET status = 'in_progress',
            location_permission_granted = false
        WHERE id = auth.uid();
    END IF;
END;
$$;
