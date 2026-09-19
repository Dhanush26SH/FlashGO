CREATE OR REPLACE FUNCTION public.get_audit_emps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'email', p.email,
            'full_name', p.full_name,
            'employee_id', p.employee_id,
            'role', p.role,
            'is_e2e', (SELECT is_e2e_test_account FROM public.dev_test_accounts dta WHERE dta.email = p.email)
        )
    ) INTO result
    FROM public.profiles p
    WHERE p.employee_id IN ('EMP-10003', 'EMP-10004', 'EMP-10005', 'EMP-10006');
    
    RETURN result;
END;
$$;
