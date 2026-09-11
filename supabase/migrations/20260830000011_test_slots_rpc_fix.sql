-- Migration: 20260830000011_test_slots_rpc_fix.sql

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
    
    v_wh_a UUID;
    v_wh_b UUID;

    v_slot_id UUID;
    v_shift_id UUID;
    
    v_log TEXT := '';
BEGIN
    v_log := v_log || 'STARTING TESTS... ';
    -- 0. Get users for testing
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    SELECT id INTO v_picker_id FROM public.profiles WHERE role = 'picker' AND is_suspended = false LIMIT 1;
    SELECT id INTO v_driver_id FROM public.profiles WHERE role = 'driver' AND is_suspended = false LIMIT 1;
    SELECT id INTO v_wh_staff_id FROM public.profiles WHERE role = 'warehouse_staff' AND is_suspended = false LIMIT 1;
    SELECT id INTO v_customer_id FROM public.profiles WHERE role = 'customer' LIMIT 1;

    SELECT warehouse_id INTO v_wh_a FROM public.profiles WHERE id = v_picker_id;
    SELECT id INTO v_wh_b FROM public.warehouses WHERE id != v_wh_a LIMIT 1;

    -- 1. Admin creates unpublished Picker slot
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'unpublished');
    SELECT id INTO v_slot_id FROM public.work_slots ORDER BY created_at DESC LIMIT 1;
    
    IF v_slot_id IS NULL THEN RAISE EXCEPTION 'FAIL: Admin create slot'; END IF;
    v_log := v_log || 'PASS: Admin created unpublished slot. ';

    -- 2. Picker cannot see unpublished slot
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    IF EXISTS (SELECT * FROM public.get_available_work_slots() g WHERE g.id = v_slot_id) THEN
        RAISE EXCEPTION 'FAIL: Picker sees unpublished slot';
    END IF;
    v_log := v_log || 'PASS: Picker cannot see unpublished slot. ';

    -- 3. Admin publishes it
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published');
    v_log := v_log || 'PASS: Admin published slot. ';

    -- 4. Matching Picker CAN see it
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    IF NOT EXISTS (SELECT * FROM public.get_available_work_slots() g WHERE g.id = v_slot_id) THEN
        RAISE EXCEPTION 'FAIL: Picker cannot see published slot';
    END IF;
    v_log := v_log || 'PASS: Picker sees published slot. ';

    -- 5. Role Security: Driver cannot book Picker slot
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_driver_id), true);
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
        RAISE EXCEPTION 'FAIL: Driver booked picker slot';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Driver rejected from booking picker slot. ';
    END;

    -- 6. Warehouse Security: Picker B cannot book Picker A slot
    UPDATE public.profiles SET warehouse_id = v_wh_b WHERE id = v_picker_id;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
        RAISE EXCEPTION 'FAIL: Worker from WH B booked WH A slot';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Worker WH mismatch rejected. ';
    END;
    UPDATE public.profiles SET warehouse_id = v_wh_a WHERE id = v_picker_id;

    -- 7. Suspension
    UPDATE public.profiles SET is_suspended = true WHERE id = v_picker_id;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
        RAISE EXCEPTION 'FAIL: Suspended worker booked slot';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Suspended worker rejected. ';
    END;
    UPDATE public.profiles SET is_suspended = false WHERE id = v_picker_id;

    -- 8. Normal Booking
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    PERFORM public.worker_book_slot(v_slot_id);
    SELECT id INTO v_shift_id FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND staff_id = v_picker_id;
    IF v_shift_id IS NULL THEN RAISE EXCEPTION 'FAIL: Normal booking failed to create shift'; END IF;
    v_log := v_log || 'PASS: Picker booked successfully. ';

    -- 9. Duplicate Booking
    BEGIN
        PERFORM public.worker_book_slot(v_slot_id);
        RAISE EXCEPTION 'FAIL: Duplicate booking succeeded';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Duplicate booking rejected. ';
    END;

    -- 10. Overlap Booking
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published');
    DECLARE v_slot2 UUID;
    BEGIN
        SELECT id INTO v_slot2 FROM public.work_slots ORDER BY created_at DESC LIMIT 1;
        PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
        PERFORM public.worker_book_slot(v_slot2);
        RAISE EXCEPTION 'FAIL: Overlap booking succeeded';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Overlap booking rejected. ';
    END;

    -- 11. Admin Structural Protection
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    BEGIN
        PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '2 days', NOW() + interval '2 days 4 hours', 2, 'published');
        RAISE EXCEPTION 'FAIL: Admin structurally edited a slot with bookings';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Admin structural edit rejected. ';
    END;

    -- 12. Admin Capacity Protection
    BEGIN
        PERFORM public.admin_edit_work_slot(v_slot_id, v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 0, 'published');
        RAISE EXCEPTION 'FAIL: Admin reduced capacity below bookings';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Admin capacity reduction rejected. ';
    END;

    -- 13. Cancellation
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    PERFORM public.worker_cancel_booking(v_shift_id);
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE id = v_shift_id AND status = 'scheduled') THEN
        RAISE EXCEPTION 'FAIL: Shift not cancelled';
    END IF;
    v_log := v_log || 'PASS: Worker cancelled securely. ';

    -- 14. Admin Cancellation
    PERFORM public.worker_book_slot(v_slot_id);
    SELECT id INTO v_shift_id FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND status = 'scheduled' LIMIT 1;
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    PERFORM public.admin_cancel_work_slot(v_slot_id);
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE id = v_shift_id AND status = 'scheduled') THEN
        RAISE EXCEPTION 'FAIL: Admin cancel did not cascade to shift';
    END IF;
    v_log := v_log || 'PASS: Admin cancelled slot successfully. ';

    -- 15. Page 6 Edit Protection
    PERFORM public.admin_create_work_slot(v_wh_a, 'picker', NOW() + interval '1 day', NOW() + interval '1 day 4 hours', 2, 'published');
    SELECT id INTO v_slot_id FROM public.work_slots ORDER BY created_at DESC LIMIT 1;
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);
    PERFORM public.worker_book_slot(v_slot_id);
    SELECT id INTO v_shift_id FROM public.staff_shifts WHERE work_slot_id = v_slot_id AND status = 'scheduled' LIMIT 1;
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    BEGIN
        PERFORM public.admin_update_shift_details(v_shift_id, v_picker_id, NOW() + interval '2 days', NOW() + interval '2 days 4 hours');
        RAISE EXCEPTION 'FAIL: Admin structurally updated a slot-backed shift via Page 6 RPC';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%FAIL%' THEN RAISE EXCEPTION '%', SQLERRM; END IF;
        v_log := v_log || 'PASS: Admin Page 6 structural update rejected. ';
    END;
    
    -- Cleanup
    DELETE FROM public.work_slots WHERE created_at >= NOW() - interval '5 minutes';
    
    RETURN v_log || 'ALL TESTS PASSED SUCCESSFULLY';
END;
$$;
