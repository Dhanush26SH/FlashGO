-- Migration: 20260830000024_rpc_admin_slot.sql

CREATE OR REPLACE FUNCTION public.test_create_admin_slot(p_capacity INT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID;
    v_wh_a UUID;
    v_slot_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test_admin@flashgo.com' LIMIT 1;
    SELECT warehouse_id INTO v_wh_a FROM public.profiles WHERE email = 'test_picker1@flashgo.com' LIMIT 1;

    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);

    v_slot_id := public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', p_capacity, 'published');
    
    RETURN v_slot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_create_admin_slot TO anon;

CREATE OR REPLACE FUNCTION public.test_check_shifts(p_slot_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM public.staff_shifts WHERE work_slot_id = p_slot_id;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_check_shifts TO anon;
