-- Migration 161: Fix driver_verify_warehouse_arrival status check

CREATE OR REPLACE FUNCTION public.driver_verify_warehouse_arrival(p_task_id UUID, p_lat FLOAT, p_lng FLOAT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_is_test_account BOOLEAN;
    v_distance_meters FLOAT;
BEGIN
    SELECT * INTO v_task 
    FROM public.driver_return_tasks 
    WHERE id = p_task_id 
      AND driver_id = v_driver_id 
      AND status = 'required';
      
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TASK_NOT_FOUND_OR_INVALID_STATUS');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    SELECT EXISTS(
        SELECT 1 FROM public.dev_test_accounts 
        WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) 
          AND bypass_geofence = true
    ) INTO v_is_test_account;
    
    IF v_distance_meters > 200 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
