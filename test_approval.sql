-- DB tests for staff approval using REAL customer profiles

DO $$
DECLARE
    v_admin_id UUID := '7e3d1c81-8051-41fc-8bf7-0c75a4097f51'; -- Admin (Alice)
    v_user_id UUID := '718a6efa-7364-44bd-b0c9-2106e44585c3'; -- Picker (Bob)
    v_test_user1 UUID := 'b78e9b9e-1641-4ebe-9957-021dd966a9b2';
    v_test_user2 UUID := '1b0b3b63-409b-4081-a483-311c77c995c1';
    v_test_user3 UUID := '569a3d84-d891-4708-971d-799571e9cf9a';
    v_warehouse_id UUID;
    v_invalid_wh UUID := '00000000-0000-0000-0000-000000000999';
    v_rec RECORD;
BEGIN
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE is_active = true LIMIT 1;

    -- Setup fake users (Reset them to customer)
    UPDATE public.profiles 
    SET role = 'customer', is_pending_staff = false, requested_role = null
    WHERE id IN (v_test_user1, v_test_user2, v_test_user3);

    -- Test 1: Fresh user requests Picker (Impersonate test_user1)
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_test_user1);
    PERFORM public.request_staff_access('Test 1 Picker', 'picker');
    
    SELECT role, requested_role, is_pending_staff INTO v_rec FROM public.profiles WHERE id = v_test_user1;
    IF v_rec.role = 'customer' AND v_rec.requested_role = 'picker' AND v_rec.is_pending_staff = true THEN
        RAISE NOTICE 'Test 1 PASS: Requested Picker';
    ELSE
        RAISE EXCEPTION 'Test 1 FAIL: %', v_rec;
    END IF;

    -- Test 2: Admin approves Picker with warehouse
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_admin_id);
    PERFORM public.approve_staff_role(v_test_user1, 'picker', 'Clean T1', v_warehouse_id);

    SELECT role, warehouse_id, is_pending_staff, employee_id INTO v_rec FROM public.profiles WHERE id = v_test_user1;
    IF v_rec.role = 'picker' AND v_rec.warehouse_id = v_warehouse_id AND v_rec.is_pending_staff = false AND v_rec.employee_id IS NOT NULL THEN
        RAISE NOTICE 'Test 2 PASS: Admin approved Picker (EMP ID: %)', v_rec.employee_id;
    ELSE
        RAISE EXCEPTION 'Test 2 FAIL: %', v_rec;
    END IF;

    -- Test 3: Warehouse Staff Approval
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_test_user2);
    PERFORM public.request_staff_access('Test 2 WS', 'warehouse_staff');
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_admin_id);
    PERFORM public.approve_staff_role(v_test_user2, 'warehouse_staff', 'Clean T2', v_warehouse_id);

    SELECT role, warehouse_id, is_pending_staff, employee_id INTO v_rec FROM public.profiles WHERE id = v_test_user2;
    IF v_rec.role = 'warehouse_staff' AND v_rec.warehouse_id = v_warehouse_id AND v_rec.is_pending_staff = false AND v_rec.employee_id IS NOT NULL THEN
        RAISE NOTICE 'Test 3 PASS: Admin approved Warehouse Staff';
    ELSE
        RAISE EXCEPTION 'Test 3 FAIL: %', v_rec;
    END IF;

    -- Test 4: Driver Generic Approval
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_admin_id);
    PERFORM public.approve_staff_role(v_test_user3, 'driver', 'Clean T3', NULL);

    SELECT role, employee_id INTO v_rec FROM public.profiles WHERE id = v_test_user3;
    IF v_rec.role = 'driver' AND v_rec.employee_id IS NOT NULL THEN
        RAISE NOTICE 'Test 4 PASS: Admin approved Driver';
    ELSE
        RAISE EXCEPTION 'Test 4 FAIL: %', v_rec;
    END IF;

    -- Test 5: Unauthorized caller
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_user_id); -- Bob is just a picker
    BEGIN
        PERFORM public.approve_staff_role(v_test_user1, 'driver', 'Fail', NULL);
        RAISE EXCEPTION 'Test 5 FAIL: Bob was able to approve!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Test 5 PASS: Unauthorized caller rejected (%)', SQLERRM;
    END;

    -- Test 6: Invalid warehouse
    EXECUTE format('SET request.jwt.claims = ''{"sub": "%s"}''', v_admin_id);
    BEGIN
        PERFORM public.approve_staff_role(v_test_user1, 'picker', 'Fail', v_invalid_wh);
        RAISE EXCEPTION 'Test 6 FAIL: Invalid warehouse was accepted!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Test 6 PASS: Invalid warehouse rejected (%)', SQLERRM;
    END;

    -- Cleanup
    UPDATE public.profiles 
    SET role = 'customer', is_pending_staff = false, requested_role = null
    WHERE id IN (v_test_user1, v_test_user2, v_test_user3);

END $$;
