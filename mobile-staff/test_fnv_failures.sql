
DO $$ 
DECLARE
  v_user_id UUID;
  v_batch_id UUID;
  v_loc_id UUID;
  v_barcode TEXT;
BEGIN
  -- We don't have valid context inside an anonymous block unless we mock it, 
  -- but we can test if the RPC fails appropriately by passing dummy data.
  
  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), -1, 'barcode', 'spoiled', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject negative quantity';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Removed quantity must be greater than zero.%' THEN
      RAISE EXCEPTION 'Wrong error for negative qty: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), 1, 'barcode', 'invalid_reason', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject invalid reason';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Invalid reason%' THEN
      RAISE EXCEPTION 'Wrong error for invalid reason: %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.remove_fnv_batch_inventory(gen_random_uuid(), gen_random_uuid(), 1, 'barcode', 'spoiled', gen_random_uuid());
    RAISE EXCEPTION 'Failed to reject non-existent user';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%User not found or suspended.%' THEN
      RAISE EXCEPTION 'Wrong error for invalid user: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'All failure path validations passed!';
END $$;
