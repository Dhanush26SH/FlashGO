-- Migration 20260916000170_fix_return_intake_order_identity.sql

CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_raw_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_token_hash TEXT;
    v_challenge public.return_handover_challenges;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
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
    WHERE id = v_challenge.driver_return_task_id AND status = 'required';

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
$function$
