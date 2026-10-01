-- Phase 2F-B: Fix Handover Challenge Generation (Upsert)

CREATE OR REPLACE FUNCTION public.driver_generate_customer_return_handover_challenge(p_task_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_raw_token TEXT;
    v_token_hash TEXT;
    v_session_id UUID;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock task
    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF v_task.assigned_driver_id != v_driver_id THEN RAISE EXCEPTION 'Task is not assigned to you'; END IF;
    IF v_task.status != 'picked_up' THEN RAISE EXCEPTION 'Task must be picked_up to generate handover challenge'; END IF;

    -- Validate active driver session
    SELECT ds.id INTO v_session_id
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active' AND ss.shift_end > NOW();

    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'No active operational session';
    END IF;

    -- Generate random token using extensions schema explicitly
    v_raw_token := encode(extensions.gen_random_bytes(16), 'hex');
    v_token_hash := extensions.crypt(v_raw_token, extensions.gen_salt('bf', 8));

    -- Upsert the challenge: one row per task
    INSERT INTO public.customer_return_handover_challenges (
        id, customer_return_task_id, token_hash, expires_at
    ) VALUES (
        gen_random_uuid(), p_task_id, v_token_hash, NOW() + INTERVAL '2 minutes'
    )
    ON CONFLICT (customer_return_task_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        created_at = NOW();

    RETURN 'CUSTOMER_RETURN_HANDOVER:' || p_task_id::TEXT || ':' || v_raw_token;
END;
$$;
