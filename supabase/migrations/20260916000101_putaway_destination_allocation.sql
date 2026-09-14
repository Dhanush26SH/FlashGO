-- Migration: 20260916000098_putaway_destination_allocation.sql
-- Description: Authoritative destination allocator with capacity reservation.

-- 1. Formalize Capacity Contract
COMMENT ON COLUMN public.warehouse_locations.capacity IS 'Maximum physical unit quantity that may be stored at this warehouse location.';

-- 2. Authoritative Destination Allocator
CREATE OR REPLACE FUNCTION public.warehouse_putaway_ensure_destination(p_task_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_task RECORD;
    v_candidate RECORD;
    v_locked_loc RECORD;
    v_used_quantity INTEGER;
    v_reserved_quantity INTEGER;
    v_available INTEGER;
BEGIN
    -- 1. Lock Putaway Task
    SELECT * INTO v_task 
    FROM public.putaway_tasks 
    WHERE id = p_task_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Task must be pending or in_progress to allocate destination';
    END IF;

    -- Idempotency check
    IF v_task.destination_location IS NOT NULL THEN
        SELECT * INTO v_locked_loc 
        FROM public.warehouse_locations 
        WHERE warehouse_id = v_task.warehouse_id AND location_code = v_task.destination_location;
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'location_id', v_locked_loc.id,
                'location_code', v_locked_loc.location_code,
                'zone', v_locked_loc.zone,
                'rack', v_locked_loc.rack,
                'shelf_level', v_locked_loc.shelf_level,
                'position', v_locked_loc.position,
                'qr_payload', v_locked_loc.barcode
            );
        END IF;
    END IF;

    -- 2. Candidate Loop (unlocked query to establish deterministic priority)
    -- Priority: Affinity first, then smallest sufficient estimated available capacity, then location code
    FOR v_candidate IN (
        SELECT wl.*,
               (CASE WHEN EXISTS (
                   SELECT 1 FROM public.warehouse_product_placements 
                   WHERE location_id = wl.id AND product_id = v_task.product_id
               ) THEN 0 ELSE 1 END) AS affinity_score,
               (wl.capacity - 
                COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = wl.id), 0) - 
                COALESCE((SELECT SUM(quantity) FROM public.putaway_tasks 
                          WHERE warehouse_id = wl.warehouse_id 
                            AND destination_location = wl.location_code 
                            AND status IN ('pending', 'in_progress') 
                            AND id <> p_task_id), 0)
               ) AS estimated_available
        FROM public.warehouse_locations wl
        WHERE wl.warehouse_id = v_task.warehouse_id
          AND wl.is_active = true
        ORDER BY 
            affinity_score ASC,
            estimated_available ASC,
            wl.location_code ASC
    ) LOOP
        -- Lock Candidate Location
        SELECT * INTO v_locked_loc 
        FROM public.warehouse_locations 
        WHERE id = v_candidate.id 
        FOR UPDATE;

        -- 3. Recalculate Live Capacity
        SELECT COALESCE(SUM(quantity), 0) INTO v_used_quantity 
        FROM public.warehouse_product_placements 
        WHERE location_id = v_locked_loc.id;

        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_quantity 
        FROM public.putaway_tasks 
        WHERE warehouse_id = v_locked_loc.warehouse_id 
          AND destination_location = v_locked_loc.location_code 
          AND status IN ('pending', 'in_progress') 
          AND id <> v_task.id;

        v_available := v_locked_loc.capacity - v_used_quantity - v_reserved_quantity;

        -- 4. Assign Destination if sufficient
        IF v_available >= v_task.quantity THEN
            UPDATE public.putaway_tasks 
            SET destination_location = v_locked_loc.location_code 
            WHERE id = v_task.id;
            
            RETURN jsonb_build_object(
                'location_id', v_locked_loc.id,
                'location_code', v_locked_loc.location_code,
                'zone', v_locked_loc.zone,
                'rack', v_locked_loc.rack,
                'shelf_level', v_locked_loc.shelf_level,
                'position', v_locked_loc.position,
                'qr_payload', v_locked_loc.barcode
            );
        END IF;
    END LOOP;

    -- No suitable location found
    RAISE EXCEPTION 'PUTAWAY_NO_DESTINATION_AVAILABLE';
END;
$$;

-- 3. Update warehouse_putaway_claim to atomically allocate destination
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
    SELECT * INTO v_shift FROM public.staff_shifts
    WHERE worker_id = v_worker_id AND status = 'active'
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

    -- Atomically assign worker and update status so it satisfies in_progress rules
    UPDATE public.putaway_tasks
    SET status = 'in_progress',
        worker_id = v_worker_id,
        claimed_at = NOW()
    WHERE id = p_task_id;

    -- Allocate Destination atomicity check
    -- If this fails (e.g., PUTAWAY_NO_DESTINATION_AVAILABLE), the entire transaction rolls back cleanly
    v_dest := public.warehouse_putaway_ensure_destination(p_task_id);

    RETURN jsonb_build_object('status', 'success', 'destination', v_dest);
END;
$$;
