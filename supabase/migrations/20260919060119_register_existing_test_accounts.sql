-- Retroactively register dynamically generated E2E test accounts into dev_test_accounts
-- based on authoritative prefix patterns found in test_auth_full.ts and scratch test scripts.

INSERT INTO public.dev_test_accounts (email)
SELECT email
FROM public.profiles
WHERE
    email ~* '^(drivera|driverb|driverm|drivermis|adminudupi|adminmanipal|adminglobal)_[0-9]+@test\.com$'
    OR email ~* '^test_(admin|picker|cust|driver)_[0-9]+@.*'
    OR email ~* '^(master|testadmin)_[0-9]+@flashgo\.com$'
    -- Specifically handle any other exact matches known to be test artifacts
    OR email IN (
        'flashgo-admin-test-v2@mailinator.com'
    )
ON CONFLICT (email) DO NOTHING;
