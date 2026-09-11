-- Migration: 20260830000026_fix_admin_slot.sql

CREATE OR REPLACE FUNCTION public.test_create_admin_slot(p_capacity INT, p_role TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID;
    v_wh_a UUID;
    v_slot_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin_12345@test.com' LIMIT 1;
    SELECT id INTO v_wh_a FROM public.warehouses LIMIT 1;

    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);

    v_slot_id := public.admin_create_work_slot(v_wh_a, p_role, NOW() + interval '1 day', NOW() + interval '1 day 4 hours', p_capacity, 'published');
    
    RETURN v_slot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_create_admin_slot(INT, TEXT) TO anon;
