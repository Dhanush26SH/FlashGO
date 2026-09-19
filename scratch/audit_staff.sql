SELECT 
  p.id as profile_uuid,
  p.full_name,
  p.email,
  p.role,
  p.employee_id,
  p.is_pending_staff,
  p.is_suspended,
  p.warehouse_id as warehouse_assignment,
  p.created_at as profile_created_at,
  au.created_at as auth_created_at,
  dta.is_e2e_test_account,
  dta.bypass_geofence,
  (dta.email IS NOT NULL) as in_dev_test_accounts,
  (SELECT count(*) FROM staff_shifts WHERE staff_id = p.id) as shifts_count,
  (SELECT count(*) FROM driver_financial_ledger WHERE driver_id = p.id) as ledger_count
FROM profiles p
JOIN auth.users au ON p.id = au.id
LEFT JOIN dev_test_accounts dta ON p.email = dta.email
WHERE p.role != 'customer';
