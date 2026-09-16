-- Migration 160: Phase 3 Driver Return Handover RPCs

CREATE OR REPLACE FUNCTION public.driver_get_return_handover_status(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task public.driver_return_tasks;
    v_intake public.return_intakes;
    v_challenge public.return_handover_challenges;
    v_expected INTEGER;
    v_received INTEGER;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = p_task_id AND driver_id = v_driver_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

    -- Get Intake
    SELECT * INTO v_intake FROM public.return_intakes WHERE driver_return_task_id = p_task_id;
    
    -- Get Challenge
    SELECT * INTO v_challenge FROM public.return_handover_challenges WHERE driver_return_task_id = p_task_id;

    IF v_intake.id IS NOT NULL THEN
        SELECT COALESCE(SUM(expected_quantity), 0), COALESCE(SUM(received_quantity), 0)
        INTO v_expected, v_received
        FROM public.return_intake_items
        WHERE return_intake_id = v_intake.id;
    END IF;

    RETURN jsonb_build_object(
        'task_status', v_task.status,
        'intake_id', v_intake.id,
        'intake_status', v_intake.status,
        'qr_generated', v_challenge.id IS NOT NULL,
        'qr_consumed', v_challenge.consumed_at IS NOT NULL,
        'qr_expires_at', v_challenge.expires_at,
        'expected_quantity', v_expected,
        'received_quantity', v_received
    );
END;
$$;

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
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = p_task_id AND driver_id = v_driver_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TASK_NOT_FOUND');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
    
    IF v_distance_meters > 200 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
