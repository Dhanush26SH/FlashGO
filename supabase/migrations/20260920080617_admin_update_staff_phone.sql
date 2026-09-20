CREATE OR REPLACE FUNCTION public.admin_update_staff_phone(p_staff_id uuid, p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_role public.user_role;
    v_target_role public.user_role;
    v_old_phone text;
    v_normalized_phone text;
BEGIN
    -- Require authenticated caller
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Verify caller's role = 'admin'
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role IS DISTINCT FROM 'admin'::public.user_role THEN
        RAISE EXCEPTION 'Forbidden: Requires admin role';
    END IF;

    -- Verify p_staff_id exists and get its role and phone
    SELECT role, phone INTO v_target_role, v_old_phone
    FROM public.profiles
    WHERE id = p_staff_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member not found';
    END IF;

    -- Only permit intended staff targets
    IF v_target_role NOT IN ('picker'::public.user_role, 'driver'::public.user_role, 'warehouse_staff'::public.user_role) THEN
        RAISE EXCEPTION 'Forbidden: Cannot edit phone for this role';
    END IF;

    -- Validate and normalize phone
    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RAISE EXCEPTION 'Phone number cannot be empty';
    END IF;

    v_normalized_phone := regexp_replace(trim(p_phone), '[^\d\+]', '', 'g');
    
    IF v_normalized_phone IS NULL OR length(v_normalized_phone) < 10 THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    -- Update only profiles.phone
    UPDATE public.profiles
    SET phone = v_normalized_phone
    WHERE id = p_staff_id;

    -- Write Audit Log
    PERFORM public.write_admin_audit_log(
        'STAFF_PHONE_UPDATE',
        'profiles',
        p_staff_id::text,
        NULL,
        jsonb_build_object('phone', v_old_phone),
        jsonb_build_object('phone', v_normalized_phone)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_staff_phone(uuid, text) TO authenticated;
