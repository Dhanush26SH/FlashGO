-- Test script for Picker assignment eligibility

BEGIN;

-- Setup test user
DO $$
DECLARE
    v_warehouse_id UUID;
    v_staff_id UUID;
    v_work_slot_1 UUID;
    v_work_slot_2 UUID;
    v_work_slot_3 UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Setup minimal references
    INSERT INTO public.warehouses (id, name, address, contact_number)
    VALUES (gen_random_uuid(), 'Test Warehouse', '123 Test St', '555-0100')
    RETURNING id INTO v_warehouse_id;

    INSERT INTO auth.users (id, email)
    VALUES (gen_random_uuid(), 'test_picker@flashgo.in');

    v_staff_id := (SELECT id FROM auth.users WHERE email = 'test_picker@flashgo.in');

    INSERT INTO public.profiles (id, email, full_name, phone_number, role, warehouse_id, is_online, is_suspended)
    VALUES (v_staff_id, 'test_picker@flashgo.in', 'Test Picker', '555-0101', 'picker', v_warehouse_id, true, false);

    -- 2. Scenario 1: 5-7 active, no next slot. We will simulate 'now' by forcing shift times relative to now.
    -- To test 7:02 when 5-7 just ended (2 mins ago), shift_end = now() - 2 mins
    RAISE NOTICE '--- TEST 1: 5-7 active, tested at 7:02 (+2 mins after end) ---';
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, role, shift_start, shift_end, status)
    VALUES (v_staff_id, v_warehouse_id, 'picker', v_now - interval '2 hours 2 minutes', v_now - interval '2 minutes', 'active');
    
    RAISE NOTICE 'Eligibility at 7:02: %', public.is_worker_eligible_for_assignment(v_staff_id);

    DELETE FROM public.staff_shifts WHERE staff_id = v_staff_id;

    RAISE NOTICE '--- TEST 1B: 5-7 active, tested at 7:06 (+6 mins after end) ---';
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, role, shift_start, shift_end, status)
    VALUES (v_staff_id, v_warehouse_id, 'picker', v_now - interval '2 hours 6 minutes', v_now - interval '6 minutes', 'active');
    
    RAISE NOTICE 'Eligibility at 7:06: %', public.is_worker_eligible_for_assignment(v_staff_id);
    RAISE NOTICE 'Shift Status after 7:06 reconciliation: %', (SELECT status FROM public.staff_shifts WHERE staff_id = v_staff_id LIMIT 1);

    DELETE FROM public.staff_shifts WHERE staff_id = v_staff_id;

    -- 3. Scenario 2: 5-7 active + 7-9 booked. Tested at 7:02
    RAISE NOTICE '--- TEST 2: 5-7 active, 7-9 booked. Tested at 7:02 ---';
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, role, shift_start, shift_end, status)
    VALUES 
    (v_staff_id, v_warehouse_id, 'picker', v_now - interval '2 hours 2 minutes', v_now - interval '2 minutes', 'active'),
    (v_staff_id, v_warehouse_id, 'picker', v_now - interval '2 minutes', v_now + interval '1 hour 58 minutes', 'booked');

    RAISE NOTICE 'Eligibility at 7:02: %', public.is_worker_eligible_for_assignment(v_staff_id);
    
    -- Print statuses to verify reconciliation
    RAISE NOTICE '5-7 shift status: %', (SELECT status FROM public.staff_shifts WHERE shift_end < v_now LIMIT 1);
    RAISE NOTICE '7-9 shift status: %', (SELECT status FROM public.staff_shifts WHERE shift_end > v_now LIMIT 1);

    DELETE FROM public.staff_shifts WHERE staff_id = v_staff_id;

    -- 4. Scenario 5: 5-7 active + 8-10 booked. Tested at 7:02
    RAISE NOTICE '--- TEST 5: 5-7 active, 8-10 booked. Tested at 7:02 ---';
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, role, shift_start, shift_end, status)
    VALUES 
    (v_staff_id, v_warehouse_id, 'picker', v_now - interval '2 hours 2 minutes', v_now - interval '2 minutes', 'active'),
    (v_staff_id, v_warehouse_id, 'picker', v_now + interval '58 minutes', v_now + interval '2 hours 58 minutes', 'booked');

    RAISE NOTICE 'Eligibility at 7:02: %', public.is_worker_eligible_for_assignment(v_staff_id);
    RAISE NOTICE '5-7 shift status (should be active): %', (SELECT status FROM public.staff_shifts WHERE shift_end < v_now LIMIT 1);
    RAISE NOTICE '8-10 shift status (should be booked): %', (SELECT status FROM public.staff_shifts WHERE shift_start > v_now LIMIT 1);

    DELETE FROM public.staff_shifts WHERE staff_id = v_staff_id;

END $$;

ROLLBACK;
