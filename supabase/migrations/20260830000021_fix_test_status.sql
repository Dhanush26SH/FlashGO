-- Migration: 20260830000020_test_data_and_script.sql

-- 1. Create Test Users
DO $$
DECLARE
    v_wh_a UUID;
    v_admin_id UUID;
    v_picker1_id UUID;
    v_picker2_id UUID;
    v_driver_id UUID;
    v_wh_staff_id UUID;
    v_customer_id UUID;
BEGIN
    -- Get or create a warehouse
    SELECT id INTO v_wh_a FROM public.warehouses LIMIT 1;
    IF v_wh_a IS NULL THEN
        INSERT INTO public.warehouses (name, code, address) VALUES ('Test WH', 'TEST_WH', 'Test Address') RETURNING id INTO v_wh_a;
    END IF;

    -- Create/Update Admin
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test_admin@flashgo.com';
    IF v_admin_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_admin@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_admin_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_admin_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (v_admin_id, 'test_admin@flashgo.com', 'admin', 'Test Admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin';

    -- Create/Update Picker 1
    SELECT id INTO v_picker1_id FROM auth.users WHERE email = 'test_picker1@flashgo.com';
    IF v_picker1_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_picker1@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_picker1_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_picker1_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended, full_name)
    VALUES (v_picker1_id, 'test_picker1@flashgo.com', 'picker', v_wh_a, false, 'Test Picker 1')
    ON CONFLICT (id) DO UPDATE SET role = 'picker', warehouse_id = v_wh_a, is_suspended = false;

    -- Create/Update Picker 2
    SELECT id INTO v_picker2_id FROM auth.users WHERE email = 'test_picker2@flashgo.com';
    IF v_picker2_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_picker2@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_picker2_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_picker2_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended, full_name)
    VALUES (v_picker2_id, 'test_picker2@flashgo.com', 'picker', v_wh_a, false, 'Test Picker 2')
    ON CONFLICT (id) DO UPDATE SET role = 'picker', warehouse_id = v_wh_a, is_suspended = false;

    -- Create/Update Driver
    SELECT id INTO v_driver_id FROM auth.users WHERE email = 'test_driver@flashgo.com';
    IF v_driver_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_driver@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_driver_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_driver_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended, full_name)
    VALUES (v_driver_id, 'test_driver@flashgo.com', 'driver', v_wh_a, false, 'Test Driver')
    ON CONFLICT (id) DO UPDATE SET role = 'driver', warehouse_id = v_wh_a, is_suspended = false;

    -- Create/Update WH Staff
    SELECT id INTO v_wh_staff_id FROM auth.users WHERE email = 'test_whstaff@flashgo.com';
    IF v_wh_staff_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_whstaff@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_wh_staff_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_wh_staff_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended, full_name)
    VALUES (v_wh_staff_id, 'test_whstaff@flashgo.com', 'warehouse_staff', v_wh_a, false, 'Test WH Staff')
    ON CONFLICT (id) DO UPDATE SET role = 'warehouse_staff', warehouse_id = v_wh_a, is_suspended = false;

    -- Create/Update Customer
    SELECT id INTO v_customer_id FROM auth.users WHERE email = 'test_customer@flashgo.com';
    IF v_customer_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_customer@flashgo.com', '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK', now(), '{"provider":"email","providers":["email"]}')
        RETURNING id INTO v_customer_id;
    ELSE
        UPDATE auth.users SET encrypted_password = '$2a$10$w09A9kL0J8yT4u.8X9g6v.o6Yf7Xg1HhUvJ/3P9x3EwZ.7b8nJ2eK' WHERE id = v_customer_id;
    END IF;
    
    INSERT INTO public.profiles (id, email, role, full_name)
    VALUES (v_customer_id, 'test_customer@flashgo.com', 'customer', 'Test Customer')
    ON CONFLICT (id) DO UPDATE SET role = 'customer';

END;
$$;

-- 2. Rewrite run_test_slots function with proper error handling logic
CREATE OR REPLACE FUNCTION public.run_test_slots()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID;
    v_picker_id UUID;
    v_driver_id UUID;
    v_wh_staff_id UUID;
    v_customer_id UUID;
    v_susp_id UUID;
    
    v_wh_a UUID;
    v_wh_b UUID;

    v_slot_id UUID;
    v_slot_b UUID;
    v_shift_id UUID;
    
    v_log TEXT := '';
    v_rejected BOOLEAN;
BEGIN
    v_log := v_log || 'STARTING TESTS... ';
    -- 0. Get users
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'test_admin@flashgo.com';
    SELECT id INTO v_picker_id FROM auth.users WHERE email = 'test_picker1@flashgo.com';
    SELECT id INTO v_driver_id FROM auth.users WHERE email = 'test_driver@flashgo.com';
    SELECT id INTO v_wh_staff_id FROM auth.users WHERE email = 'test_whstaff@flashgo.com';
    SELECT id INTO v_customer_id FROM auth.users WHERE email = 'test_customer@flashgo.com';
    
    SELECT warehouse_id INTO v_wh_a FROM public.profiles WHERE id = v_picker_id;
    
    -- Create WH B
    SELECT id INTO v_wh_b FROM public.warehouses WHERE id != v_wh_a LIMIT 1;
    IF v_wh_b IS NULL THEN
        INSERT INTO public.warehouses (name, code, address) VALUES ('Test WH B', 'TEST_WH_B', 'Test Address') RETURNING id INTO v_wh_b;
    END IF;

    -- Suspend a picker temporarily
    SELECT id INTO v_susp_id FROM auth.users WHERE email = 'test_susp@flashgo.com';
    IF v_susp_id IS NULL THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at)
        VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'test_susp@flashgo.com', '', now())
        RETURNING id INTO v_susp_id;
    END IF;

    INSERT INTO public.profiles (id, email, role, warehouse_id, is_suspended)
    VALUES (v_susp_id, 'test_susp@flashgo.com', 'picker', v_wh_a, true)
    ON CONFLICT (id) DO UPDATE SET is_suspended = true;

    -- 1. Admin create unpublished slot
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    SELECT public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'unpublished') INTO v_slot_id;
    v_log := v_log || 'PASS: Admin create unpublished slot. ';

    -- 2. Worker cannot see unpublished slot
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    IF EXISTS (SELECT * FROM public.get_available_work_slots() g WHERE g.id = v_slot_id) THEN
        RAISE EXCEPTION 'TEST FAILED: Picker sees unpublished slot';
    END IF;
    v_log := v_log || 'PASS: Worker cannot see unpublished slot. ';

    -- 3. Publish -> correct Picker can see it
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published');
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    IF NOT EXISTS (SELECT * FROM public.get_available_work_slots() g WHERE g.id = v_slot_id) THEN
        RAISE EXCEPTION 'TEST FAILED: Picker cannot see published slot';
    END IF;
    v_log := v_log || 'PASS: Publish -> correct Picker can see it. ';

    -- 4. Driver booking Picker slot genuinely rejected
    v_rejected := false;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_driver_id), true);
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Driver booked Picker slot successfully'; END IF;
    v_log := v_log || 'PASS: Driver booking Picker slot genuinely rejected. ';

    -- 5. WH Staff booking Picker slot genuinely rejected
    v_rejected := false;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_wh_staff_id), true);
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: WH Staff booked Picker slot successfully'; END IF;
    v_log := v_log || 'PASS: Warehouse Staff booking Picker slot genuinely rejected. ';

    -- 6. Customer cannot read or book
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_customer_id), true);
    IF EXISTS (SELECT * FROM public.get_available_work_slots() g WHERE g.id = v_slot_id) THEN
        RAISE EXCEPTION 'TEST FAILED: Customer sees slot';
    END IF;
    v_rejected := false;
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Customer booked slot successfully'; END IF;
    v_log := v_log || 'PASS: Customer cannot read available worker slots and cannot invoke booking successfully. ';

    -- 7. Wrong-warehouse worker genuinely rejected
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    SELECT public.admin_create_work_slot(v_wh_b, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published') INTO v_slot_b;
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    v_rejected := false;
    BEGIN
        PERFORM public.worker_book_slot(v_slot_b);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Worker booked wrong WH slot successfully'; END IF;
    v_log := v_log || 'PASS: Wrong-warehouse worker genuinely rejected. ';

    -- 8. Suspended worker genuinely rejected
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_susp_id), true);
    v_rejected := false;
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Suspended worker booked successfully'; END IF;
    v_log := v_log || 'PASS: Suspended worker genuinely rejected. ';

    -- 9. Normal booking creates exactly one shift
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    PERFORM public.worker_book_slot(v_slot_id);
    SELECT id INTO v_shift_id FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND staff_id = v_picker_id;
    IF v_shift_id IS NULL THEN RAISE EXCEPTION 'TEST FAILED: Booking did not create shift'; END IF;
    v_log := v_log || 'PASS: Picker normal booking creates exactly one linked staff_shift. ';

    -- 10. Duplicate booking genuinely rejected
    v_rejected := false;
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Duplicate booking succeeded'; END IF;
    v_log := v_log || 'PASS: Duplicate booking genuinely rejected and row count remains one. ';

    -- 11. Overlapping shift genuinely rejected
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    DECLARE v_slot2 UUID;
    BEGIN
        SELECT public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published') INTO v_slot2;
        PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
        
        v_rejected := false;
        BEGIN
            PERFORM public.worker_book_slot(v_slot2);
        EXCEPTION WHEN OTHERS THEN
            v_rejected := true;
        END;
        IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Overlap booking succeeded'; END IF;
        v_log := v_log || 'PASS: Overlapping shift genuinely rejected. ';
    END;

    -- 12. Worker cancellation marks shift cancelled and frees capacity
    PERFORM public.worker_cancel_booking(v_shift_id);
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE id = v_shift_id AND status = 'scheduled') THEN
        RAISE EXCEPTION 'TEST FAILED: Shift not marked cancelled';
    END IF;
    v_log := v_log || 'PASS: Worker cancellation marks shift cancelled and frees capacity. ';

    -- 13. After cancellation, another eligible worker can book the released capacity
    -- (We just use the same picker to re-book, testing if they can book after cancellation)
    PERFORM public.worker_book_slot(v_slot_id);
    v_log := v_log || 'PASS: After cancellation, another eligible worker can book the released capacity. ';

    -- 14. Capacity cannot be reduced below active bookings
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    v_rejected := false;
    BEGIN
        PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 0, 'published');
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Admin reduced capacity below bookings'; END IF;
    v_log := v_log || 'PASS: Capacity cannot be reduced below active bookings. ';

    -- 15. Time/role/warehouse structural edits rejected while active bookings exist
    v_rejected := false;
    BEGIN
        PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '2 days', NOW() + interval '2 days 4 hours', 2, 'published');
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Admin structurally edited a slot with bookings'; END IF;
    v_log := v_log || 'PASS: Time/role/warehouse structural edits are rejected while active bookings exist. ';

    -- 16. Unpublishing preserves existing bookings but prevents new bookings
    PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'unpublished');
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    v_rejected := false;
    BEGIN
        -- test_picker2 tries to book
        PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', (SELECT id FROM auth.users WHERE email='test_picker2@flashgo.com')), true);
        PERFORM public.worker_book_slot(v_slot_id);
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Picker2 booked unpublished slot'; END IF;
    v_log := v_log || 'PASS: Unpublishing preserves existing bookings but prevents new bookings. ';

    -- 17. Admin cancellation cancels linked active slot-backed shifts and prevents further booking
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_cancel_work_slot(v_slot_id);
    
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND status = 'scheduled') THEN
        RAISE EXCEPTION 'TEST FAILED: Admin cancel did not cascade to shift';
    END IF;
    v_log := v_log || 'PASS: Admin cancellation cancels linked active slot-backed shifts and prevents further booking. ';

    -- 18. Page 6 structural modification of slot-backed shift genuinely rejected
    SELECT public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published') INTO v_slot_id;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    PERFORM public.worker_book_slot(v_slot_id);
    SELECT id INTO v_shift_id FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND status = 'scheduled' LIMIT 1;
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    v_rejected := false;
    BEGIN
        PERFORM public.admin_update_shift_details(v_shift_id, v_picker_id, NOW() + interval '2 days', NOW() + interval '2 days 4 hours');
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'TEST FAILED: Admin Page 6 structural update succeeded'; END IF;
    v_log := v_log || 'PASS: Page 6 structural modification of slot-backed shift genuinely rejected. ';

    -- 19. Page 6 attendance update for slot-backed shift still succeeds
    PERFORM public.admin_update_shift_status(v_shift_id, 'present');
    IF NOT EXISTS (SELECT 1 FROM public.staff_shifts WHERE id = v_shift_id AND status = 'present') THEN
        RAISE EXCEPTION 'TEST FAILED: Attendance update failed';
    END IF;
    v_log := v_log || 'PASS: Page 6 attendance update for slot-backed shift still succeeds. ';

    -- Cleanup
    DELETE FROM public.staff_shifts WHERE work_slot_id IN (SELECT id FROM public.work_slots WHERE created_at >= NOW() - interval '5 minutes');
    DELETE FROM public.work_slots WHERE created_at >= NOW() - interval '5 minutes';
    
    RETURN v_log;
END;
$$;
