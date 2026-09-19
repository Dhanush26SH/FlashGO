SELECT id, email, full_name, employee_id, role, created_at,
       (SELECT is_e2e_test_account FROM public.dev_test_accounts dta WHERE dta.email = p.email) as is_e2e
FROM public.profiles p
WHERE employee_id IN ('EMP-10003', 'EMP-10004', 'EMP-10005', 'EMP-10006');
