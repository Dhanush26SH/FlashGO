-- Migration: 20260830000022_fix_auth_users.sql

DO $$
BEGIN
    UPDATE auth.users 
    SET aud = 'authenticated', role = 'authenticated'
    WHERE email IN (
        'test_admin@flashgo.com', 
        'test_picker1@flashgo.com', 
        'test_picker2@flashgo.com', 
        'test_driver@flashgo.com', 
        'test_whstaff@flashgo.com', 
        'test_customer@flashgo.com'
    );
END;
$$;
