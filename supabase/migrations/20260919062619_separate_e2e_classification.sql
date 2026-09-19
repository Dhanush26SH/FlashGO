-- 1. Add new column to explicitly mark disposable E2E accounts
ALTER TABLE public.dev_test_accounts 
ADD COLUMN is_e2e_test_account BOOLEAN DEFAULT false;

-- 2. Backfill existing disposable accounts by their known patterns
-- Ensure we do not mark persistent/operational bypass accounts like drivarrr1@gmail.com
UPDATE public.dev_test_accounts
SET is_e2e_test_account = true
WHERE (
    email ~* '^(drivera|driverb|driverm|drivermis|adminudupi|adminmanipal|adminglobal)_[0-9]+@test\.com$'
    OR email ~* '^test_(admin|picker|cust|driver)_[0-9]+@.*'
    OR email ~* '^(master|testadmin)_[0-9]+@flashgo\.com$'
    OR email IN (
        'flashgo-admin-test-v2@mailinator.com'
    )
) AND email != 'drivarrr1@gmail.com';
