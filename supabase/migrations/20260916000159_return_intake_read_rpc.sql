-- Migration 159: Staff Read RPC for Return Intake Details

CREATE OR REPLACE FUNCTION public.staff_get_return_intake(p_intake_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
    v_driver public.profiles;
    v_warehouse public.warehouses;
    v_items JSONB;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- Must have an active shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Get Intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    IF v_intake.warehouse_id != v_active_shift.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse';
    END IF;

    -- Fetch Context
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE id = v_intake.driver_return_task_id;
    SELECT * INTO v_driver FROM public.profiles WHERE id = v_intake.driver_id;
    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_intake.warehouse_id;

    -- Fetch Items
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', rii.id,
            'order_id', rii.order_id,
            'product_id', rii.product_id,
            'product_name', p.name,
            'barcode', p.internal_barcode,
            'expected_quantity', rii.expected_quantity,
            'received_quantity', rii.received_quantity
        )
    ), '[]'::jsonb) INTO v_items
    FROM public.return_intake_items rii
    JOIN public.products p ON p.id = rii.product_id
    WHERE rii.return_intake_id = p_intake_id;

    RETURN jsonb_build_object(
        'id', v_intake.id,
        'status', v_intake.status,
        'trip_id', v_intake.trip_id,
        'driver_name', v_driver.full_name,
        'warehouse_name', v_warehouse.name,
        'items', v_items
    );
END;
$$;
