-- Migration: 20260830000025_test_proxy.sql

CREATE OR REPLACE FUNCTION public.test_set_profile(p_email TEXT, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_wh_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

    SELECT id INTO v_wh_id FROM public.warehouses LIMIT 1;

    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended)
    VALUES (v_user_id, p_email, p_role, v_wh_id, false)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, warehouse_id = EXCLUDED.warehouse_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_set_profile TO anon;
