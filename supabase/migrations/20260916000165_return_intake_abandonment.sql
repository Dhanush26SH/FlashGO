-- Migration 20260916000165_return_intake_abandonment.sql

-- 1. Add 'voided' to status checks
ALTER TABLE public.driver_return_tasks 
DROP CONSTRAINT driver_return_tasks_status_check;
ALTER TABLE public.driver_return_tasks 
ADD CONSTRAINT driver_return_tasks_status_check 
CHECK (status = ANY (ARRAY['required'::text, 'completed'::text, 'expired'::text, 'voided'::text]));

ALTER TABLE public.return_intakes 
DROP CONSTRAINT return_intakes_status_check;
ALTER TABLE public.return_intakes 
ADD CONSTRAINT return_intakes_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'scanning'::text, 'completed'::text, 'discrepancy'::text, 'voided'::text]));

-- 2. Add audit fields to return_intakes
ALTER TABLE public.return_intakes 
ADD COLUMN voided_at TIMESTAMPTZ,
ADD COLUMN voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN void_reason TEXT;

-- 3. Modify staff_get_return_intake
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
    v_can_abandon BOOLEAN := FALSE;
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

    -- Calculate abandon eligibility
    IF v_intake.status = 'scanning' 
       AND v_task.status = 'required' 
       AND v_task.return_type = 'merchandise' 
       AND v_task.order_id IS NULL 
       AND jsonb_array_length(v_items) = 0 
       AND NOT EXISTS (SELECT 1 FROM public.return_scan_operations WHERE return_intake_id = p_intake_id) THEN
        v_can_abandon := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'id', v_intake.id,
        'status', v_intake.status,
        'trip_id', v_intake.trip_id,
        'driver_name', v_driver.full_name,
        'warehouse_name', v_warehouse.name,
        'items', v_items,
        'can_abandon_invalid_intake', v_can_abandon
    );
END;
$$;

-- 4. Create staff_abandon_return_intake RPC
CREATE OR REPLACE FUNCTION public.staff_abandon_return_intake(
    p_intake_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_active_shift public.staff_shifts;
    v_intake public.return_intakes;
    v_task public.driver_return_tasks;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization & Active Shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY start_time DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Lock Intake & Task FOR UPDATE to prevent race conditions
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    IF v_intake.warehouse_id != v_active_shift.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse';
    END IF;

    IF v_intake.status != 'scanning' THEN
        RAISE EXCEPTION 'Intake is not scanning';
    END IF;

    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_intake.driver_return_task_id FOR UPDATE;

    IF v_task.status != 'required' THEN
        RAISE EXCEPTION 'Task is not required';
    END IF;
    
    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'Only merchandise tasks can be abandoned via this flow';
    END IF;

    -- Strict validation based on reason
    IF p_reason = 'invalid_expected_items' THEN
        IF v_task.order_id IS NOT NULL THEN
            RAISE EXCEPTION 'Task has an order_id. Cannot abandon for invalid_expected_items.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.return_intake_items WHERE return_intake_id = p_intake_id) THEN
            RAISE EXCEPTION 'Intake items exist. Cannot abandon.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.return_scan_operations WHERE return_intake_id = p_intake_id) THEN
            RAISE EXCEPTION 'Scan operations exist. Cannot abandon.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid reason';
    END IF;

    -- Execute Abandonment
    UPDATE public.return_intakes
    SET status = 'voided',
        voided_at = NOW(),
        voided_by = v_staff_id,
        void_reason = p_reason
    WHERE id = p_intake_id;

    UPDATE public.driver_return_tasks
    SET status = 'voided'
    WHERE id = v_task.id;

    RETURN jsonb_build_object('success', true);
END;
$$;
