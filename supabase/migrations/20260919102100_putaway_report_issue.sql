-- Migration: 20260919102100_putaway_report_issue.sql
-- Description: RPC for warehouse staff to report a location issue and reassign destination.

CREATE OR REPLACE FUNCTION public.warehouse_putaway_report_issue(
    p_task_id UUID,
    p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_worker_id UUID;
    v_task RECORD;
    v_shift RECORD;
    v_dest JSONB;
    v_old_loc RECORD;
BEGIN
    v_worker_id := auth.uid();
    
    -- 1. Validate shift and duty
    SELECT * INTO v_shift FROM public.staff_shifts
    WHERE worker_id = v_worker_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;
    
    IF NOT FOUND OR v_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Worker must be on an active putaway duty';
    END IF;

    -- 2. Lock the task
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;
    
    IF v_task.status != 'in_progress' OR v_task.worker_id != v_worker_id THEN
        RAISE EXCEPTION 'Task is not in progress by you';
    END IF;
    
    IF v_task.warehouse_id != v_shift.warehouse_id THEN
        RAISE EXCEPTION 'Task belongs to a different warehouse';
    END IF;

    -- 3. Audit Logging
    IF v_task.destination_location IS NOT NULL THEN
        SELECT * INTO v_old_loc FROM public.warehouse_locations 
        WHERE location_code = v_task.destination_location AND warehouse_id = v_task.warehouse_id;

        IF FOUND THEN
            INSERT INTO public.warehouse_placement_events (
                warehouse_id, product_id, from_location_id, quantity, event_type, source, actor_id
            ) VALUES (
                v_task.warehouse_id, v_task.product_id, v_old_loc.id, v_task.quantity, 'location_rejected', p_reason, v_worker_id
            );
        END IF;
    END IF;

    -- 4. Clear existing destination
    UPDATE public.putaway_tasks
    SET destination_location = NULL
    WHERE id = p_task_id;

    -- 5. Allocate new destination using the corrected allocator
    v_dest := public.warehouse_putaway_ensure_destination(p_task_id);

    RETURN jsonb_build_object('status', 'success', 'destination', v_dest);
END;
$$;
