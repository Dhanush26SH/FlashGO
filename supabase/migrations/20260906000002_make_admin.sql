UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'test_admin_batch@example.com' LIMIT 1);
