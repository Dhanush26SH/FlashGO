CREATE OR REPLACE FUNCTION public.test_run_good(p_user_id UUID, p_location_id UUID, p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  -- Set auth context
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id)::text, true);
  
  SELECT public.record_fnv_inspection_good(p_location_id, p_batch_id) INTO v_res;
  RETURN v_res;
END;
$$;
