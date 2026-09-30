-- 20260930000002_fix_merchandise_return_lifecycle.sql
CREATE OR REPLACE FUNCTION public.generate_return_handover_qr(p_task_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_driver_id UUID;
    v_task public.driver_return_tasks;
    v_raw_token TEXT;
    v_token_hash TEXT;
BEGIN
    v_driver_id := auth.uid();
    
    -- Verify task exists, is active, and belongs to the calling driver
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = p_task_id AND driver_id = v_driver_id AND status IN ('required', 'at_warehouse');
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task not found or unauthorized';
    END IF;

    -- Generate a cryptographically random token
    v_raw_token := encode(extensions.gen_random_bytes(24), 'base64');
    
    -- We assume pgcrypto extension is installed
    v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');

    -- Insert or replace the challenge for this task
    INSERT INTO public.return_handover_challenges (
        driver_return_task_id, token_hash, expires_at
    )
    VALUES (
        p_task_id, v_token_hash, now() + interval '5 minutes'
    )
    ON CONFLICT (driver_return_task_id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        created_at = now();

    RETURN v_raw_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_raw_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_is_retired BOOLEAN;
    v_active_shift public.staff_shifts;
    v_token_hash TEXT;
    v_challenge public.return_handover_challenges;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization
    SELECT role, COALESCE(is_retired, false) INTO v_staff_role, v_is_retired FROM public.profiles WHERE id = v_staff_id;
    IF v_is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;
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

    -- Hash the incoming token (SCHEMA QUALIFIED)
    v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');

    -- Find and lock the challenge (atomic check-and-consume)
    SELECT * INTO v_challenge
    FROM public.return_handover_challenges
    WHERE token_hash = v_token_hash 
      AND expires_at > now() 
      AND consumed_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or consumed QR challenge';
    END IF;

    -- Find the task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_challenge.driver_return_task_id AND status IN ('required', 'at_warehouse');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task is no longer required';
    END IF;

    -- ENFORCE MERCHANDISE RETURN ONLY
    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'NOT_MERCHANDISE_RETURN';
    END IF;

    -- ENFORCE DURABLE ORDER IDENTITY
    IF v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Merchandise return task is missing order_id';
    END IF;

    -- Ensure staff shift warehouse matches task warehouse
    IF v_active_shift.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse than the return task';
    END IF;

    -- Mark challenge consumed
    UPDATE public.return_handover_challenges 
    SET consumed_at = now() 
    WHERE id = v_challenge.id;

    -- Insert the intake session
    INSERT INTO public.return_intakes (
        driver_return_task_id, trip_id, driver_id, warehouse_id, received_by_staff_id, status
    )
    VALUES (
        v_task.id, v_task.trip_id, v_task.driver_id, v_task.warehouse_id, v_staff_id, 'scanning'
    )
    RETURNING id INTO v_intake_id;

    -- Populate expected return items directly from the exact order items
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        v_intake_id,
        v_task.order_id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.order_items oi
    WHERE oi.order_id = v_task.order_id;

    RETURN v_intake_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_get_return_intake(p_intake_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       AND v_task.status IN ('required', 'at_warehouse') 
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
$function$;

CREATE OR REPLACE FUNCTION public.staff_abandon_return_intake(p_intake_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    ORDER BY started_at DESC LIMIT 1;

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

    IF v_task.status NOT IN ('required', 'at_warehouse') THEN
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
$function$;
