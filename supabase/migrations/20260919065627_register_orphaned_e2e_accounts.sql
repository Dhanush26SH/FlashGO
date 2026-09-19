-- Upsert confirmed orphaned E2E test accounts to dev_test_accounts
INSERT INTO public.dev_test_accounts (email, bypass_geofence, is_e2e_test_account)
VALUES 
  ('staff_1788159163392@test.com', false, true),
  ('staff_1788159196989@test.com', false, true),
  ('staff_1788159261272@test.com', false, true),
  ('admin_1788158869689@test.com', false, true)
ON CONFLICT (email) 
DO UPDATE SET 
  is_e2e_test_account = true,
  -- preserve bypass_geofence if it existed, though for these E2E it's false by default
  bypass_geofence = COALESCE(dev_test_accounts.bypass_geofence, EXCLUDED.bypass_geofence);
