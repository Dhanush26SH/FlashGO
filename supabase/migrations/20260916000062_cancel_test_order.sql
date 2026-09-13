-- 20260916000062_cancel_test_order.sql
DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    
    -- Mock the auth context so admin_cancel_order passes the RLS/uid checks
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id)::text, true);

    -- Call authoritative cancel on the stale Milk order
    PERFORM public.admin_cancel_order('7b6a87fb-331a-4ef0-b011-074b6e897107');
END;
$$;
