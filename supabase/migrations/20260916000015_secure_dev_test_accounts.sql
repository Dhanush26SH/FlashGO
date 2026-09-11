-- Migration: 20260916000013_secure_dev_test_accounts.sql
-- Description: Enable RLS on dev_test_accounts and add secure RPC

-- 1. Enable RLS to prevent direct read/write from frontend
ALTER TABLE public.dev_test_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all access by default for anon/authenticated roles
-- (Since no policies are created, default deny applies)

-- 3. Create a secure RPC for the driver to fetch their own flags
CREATE OR REPLACE FUNCTION public.get_my_dev_test_flags()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_email TEXT;
    v_bypass_geofence BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Fetch securely from auth.users
    SELECT email INTO v_driver_email FROM auth.users WHERE id = auth.uid();

    SELECT bypass_geofence INTO v_bypass_geofence 
    FROM public.dev_test_accounts 
    WHERE email = v_driver_email;

    IF v_bypass_geofence IS NULL THEN
        v_bypass_geofence := false;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'flags', jsonb_build_object('bypass_geofence', v_bypass_geofence)
    );
END;
$$;
