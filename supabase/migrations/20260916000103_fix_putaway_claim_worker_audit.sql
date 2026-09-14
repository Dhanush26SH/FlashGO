-- Migration: 20260916000103_fix_putaway_claim_worker_audit.sql
-- Description: Fix warehouse_putaway_claim relation error by correcting staff_shifts column reference.

CREATE OR REPLACE FUNCTION public.warehouse_putaway_claim(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_worker_id UUID;
    v_task RECORD;
    v_shift RECORD;
    v_dest JSONB;
BEGIN
    v_worker_id := auth.uid();
    
    -- Check shift and duty
    -- FIX: The staff_shifts relation uses 'staff_id', not 'worker_id'
    SELECT * INTO v_shift FROM public.staff_shifts
    WHERE staff_id = v_worker_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;
    
    IF NOT FOUND OR v_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Worker must be on an active putaway duty';
    END IF;

    -- Check online status
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_worker_id AND warehouse_is_online = true) THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    -- Lock the task
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;
    
    IF v_task.status != 'pending' THEN
        RAISE EXCEPTION 'Task is not pending';
    END IF;
    
    IF v_task.warehouse_id != v_shift.warehouse_id THEN
        RAISE EXCEPTION 'Task belongs to a different warehouse';
    END IF;

    -- Atomically assign worker and update status
    UPDATE public.putaway_tasks
    SET status = 'in_progress',
        worker_id = v_worker_id,
        claimed_at = NOW()
    WHERE id = p_task_id;

    -- Allocate Destination atomicity check
    v_dest := public.warehouse_putaway_ensure_destination(p_task_id);

    -- Audit log fix: Match LIVE schema exactly (restored in 102)
    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, warehouse_id, metadata
    ) VALUES (
        v_worker_id, 'putaway_claimed', 'putaway_task', p_task_id, v_shift.warehouse_id,
        jsonb_build_object('worker_id', v_worker_id)
    );

    RETURN jsonb_build_object('status', 'success', 'destination', v_dest);
END;
$$;


-- Temporary function to retrieve task details for the physical test verification
CREATE OR REPLACE FUNCTION public.temp_read_only_find_task(p_batch_id_part TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
BEGIN
    SELECT * INTO v_task FROM public.putaway_tasks 
    WHERE batch_id::text LIKE '%' || p_batch_id_part || '%'
    LIMIT 1;

    RETURN jsonb_build_object(
        'task_id', v_task.id,
        'status', v_task.status,
        'worker_id', v_task.worker_id,
        'claimed_at', v_task.claimed_at,
        'destination_location', v_task.destination_location,
        'quantity', v_task.quantity
    );
END;
$$;
