ALTER TABLE public.customer_return_tasks
ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.driver_mark_customer_return_arrived(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the task FOR UPDATE
    SELECT * INTO v_task 
    FROM public.customer_return_tasks 
    WHERE id = p_task_id 
    FOR UPDATE;

    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.assigned_driver_id != v_driver_id THEN
        RAISE EXCEPTION 'Task is not assigned to you';
    END IF;

    IF v_task.status = 'at_customer' THEN
        RETURN TRUE; -- Idempotent return
    END IF;

    IF v_task.status != 'accepted' THEN
        RAISE EXCEPTION 'Task must be accepted before marking arrived (current status: %)', v_task.status;
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RAISE EXCEPTION 'No active operational session';
    END IF;

    -- Mark arrived
    UPDATE public.customer_return_tasks
    SET status = 'at_customer',
        arrived_at = NOW(),
        updated_at = NOW()
    WHERE id = p_task_id;

    RETURN TRUE;
END;
$$;
