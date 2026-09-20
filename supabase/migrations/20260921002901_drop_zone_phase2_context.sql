-- Migration: 20260921002901_drop_zone_phase2_context.sql
-- Description: Update handover context to support Drop Zone Fallback

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
    v_trip_created_at TIMESTAMPTZ := NULL;
    v_full_name TEXT := NULL;
    v_employee_id TEXT := NULL;
    v_phone TEXT := NULL;
    v_drop_zone_status TEXT := NULL;
    v_drop_zone_code TEXT := NULL;
    v_drop_zone_id UUID := NULL;
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
        SELECT status, created_at INTO v_trip_status, v_trip_created_at FROM public.logistics_trips WHERE id = v_order.trip_id;
        
        -- Check Drop Zone Allocation Phase 2
        SELECT dza.status, dza.drop_zone_id, dz.zone_code 
        INTO v_drop_zone_status, v_drop_zone_id, v_drop_zone_code
        FROM public.drop_zone_allocations dza
        JOIN public.drop_zones dz ON dza.drop_zone_id = dz.id
        WHERE dza.order_id = p_order_id AND dza.status IN ('allocated', 'placed', 'driver_assigned')
        LIMIT 1;
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
        'trip_created_at', v_trip_created_at,
        'bag_number', v_order.bag_number,
        'order_number', v_order.order_number,
        'drop_zone_status', v_drop_zone_status,
        'drop_zone_code', v_drop_zone_code,
        'drop_zone_id', v_drop_zone_id
    ) INTO res;
    
    RETURN res;
END;
$$;
