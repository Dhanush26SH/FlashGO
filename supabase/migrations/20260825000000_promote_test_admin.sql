-- Promote test admin
UPDATE public.profiles SET role = 'admin', full_name = 'Test Admin' WHERE email = 'flashgo-admin-test-v2@mailinator.com';
