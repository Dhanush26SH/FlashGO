BEGIN;
  
  DO $$
  DECLARE
      v_driver_id UUID := gen_random_uuid();
      v_warehouse_id UUID := gen_random_uuid();
      v_batch RECORD;
  BEGIN
      RAISE NOTICE '--- STARTING AUTOMATED TRANSACTION TESTS ---';
  
      -- 1. Create fake driver & warehouse
      INSERT INTO auth.users (id, email) VALUES (v_driver_id, 'test_driver_guard@flashgo.local');
      INSERT INTO public.profiles (id, full_name, email, role, is_pending_staff, warehouse_id)
      VALUES (v_driver_id, 'Test Guard Driver', 'test_driver_guard@flashgo.local', 'driver', false, v_warehouse_id);
  
      INSERT INTO public.warehouses (id, name, location, city, state, pincode, type, status)
      VALUES (v_warehouse_id, 'Test Warehouse', 'Location', 'City', 'State', '000000', 'dark_store', 'active');
  
      ---------------------------------------------------------
      -- TEST CASE 1: Attempt to generate a settlement for an active period
      ---------------------------------------------------------
      RAISE NOTICE '[TEST 1] Generate active period settlement';
      -- Assuming today is Sept 19, 2026. 
      -- The week of Sept 14, 2026 ends on Sept 21, 2026.
      
      BEGIN
          PERFORM public.create_driver_settlement_batch(v_warehouse_id, '2026-09-14', ARRAY[v_driver_id]);
          RAISE EXCEPTION 'TEST 1 FAILED: Should have rejected active period generation';
      EXCEPTION
          WHEN OTHERS THEN
              IF SQLERRM LIKE '%is still active. Generation will be available on%' THEN
                  RAISE NOTICE 'Active Period Generation Rejected As Expected: %', SQLERRM;
              ELSE
                  RAISE EXCEPTION 'Unexpected error message: %', SQLERRM;
              END IF;
      END;

      ---------------------------------------------------------
      -- TEST CASE 2: Generate for a properly closed period
      ---------------------------------------------------------
      RAISE NOTICE '[TEST 2] Generate closed period settlement';
      -- A week far in the past: Sept 07, 2026.
      -- We must insert ledger data so that it's generated properly.
      INSERT INTO public.driver_financial_ledger (driver_id, amount, transaction_type, occurred_at)
      VALUES (v_driver_id, 100, 'delivery_earning', '2026-09-08 10:00:00+05:30');
      
      SELECT * INTO v_batch FROM public.create_driver_settlement_batch(v_warehouse_id, '2026-09-07', ARRAY[v_driver_id]);
      
      ASSERT (v_batch::JSONB->>'processed_count')::INT = 1;
      RAISE NOTICE 'Closed Period Generation Succeeded As Expected.';
  
      RAISE NOTICE '--- TESTS PASSED SUCCESSFULLY ---';
  END $$;
  
  ROLLBACK;
