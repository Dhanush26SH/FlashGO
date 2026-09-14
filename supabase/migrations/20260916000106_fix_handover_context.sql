-- Fix get_order_handover_context RPC "record not assigned yet" error
CREATE OR REPLACE FUNCTION public.get_order_handover_context(p_order_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_order RECORD;
    v_trip_status TEXT := NULL;
    v_full_name TEXT := NULL;
    v_employee_id TEXT := NULL;
    v_phone TEXT := NULL;
    res json;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    
    -- Check Authorization: must be the assigned picker OR an admin/warehouse manager
    IF v_order.picker_id != v_caller_id AND v_caller_role NOT IN ('admin', 'warehouse_manager', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_order.trip_id IS NOT NULL THEN
        SELECT status INTO v_trip_status FROM public.logistics_trips WHERE id = v_order.trip_id;
    END IF;

    IF v_order.driver_id IS NOT NULL THEN
        SELECT full_name, employee_id, phone INTO v_full_name, v_employee_id, v_phone FROM public.profiles WHERE id = v_order.driver_id;
    END IF;

    SELECT json_build_object(
        'driver_id', v_order.driver_id,
        'full_name', v_full_name,
        'employee_id', v_employee_id,
        'phone', v_phone,
        'order_status', v_order.status,
        'trip_status', v_trip_status,
        'bag_number', v_order.bag_number,
        'order_number', v_order.order_number
    ) INTO res;
    
    RETURN res;
END;
$$;
