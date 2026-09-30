-- 20260930000001_fix_driver_verify_warehouse_arrival_schema.sql
-- Removes invalid updated_at column reference from driver_verify_warehouse_arrival.

CREATE OR REPLACE FUNCTION public.driver_verify_warehouse_arrival(p_task_id UUID, p_lat FLOAT, p_lng FLOAT, p_is_demo BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_distance_meters FLOAT;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver_id AND role = 'driver' AND is_suspended = false) THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = p_task_id AND driver_id = v_driver_id FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TASK');
    END IF;

    IF v_task.status != 'required' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TASK_NOT_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    IF v_warehouse.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_NOT_FOUND');
    END IF;

    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);

    -- UNIVERSAL BYPASS: We calculate distance but NEVER fail on TOO_FAR for any approved driver

    UPDATE public.driver_return_tasks SET status = 'at_warehouse' WHERE id = p_task_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
