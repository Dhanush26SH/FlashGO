-- Migration: 20260916000102_fix_putaway_audit_logging.sql
-- Description: Forward-only fix for admin_audit_logs schema incompatibilities in Putaway RPCs.

-- 1. Fix warehouse_putaway_complete (originally from Migration 97)
CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_product_barcode TEXT,
    p_scanned_location_qr TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_active_shift RECORD;
    v_task RECORD;
    v_product RECORD;
    v_scanned_location RECORD;
BEGIN
    -- Validate worker and state
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'NOT_WAREHOUSE_STAFF';
    END IF;

    IF v_profile.warehouse_is_online != true THEN
        RAISE EXCEPTION 'WAREHOUSE_STAFF_OFFLINE';
    END IF;

    SELECT COUNT(*) INTO v_active_shifts_count FROM public.staff_shifts WHERE staff_id = auth.uid() AND status = 'active';
    IF v_active_shifts_count = 0 THEN
        RAISE EXCEPTION 'SHIFT_NOT_ACTIVE';
    ELSIF v_active_shifts_count > 1 THEN
        RAISE EXCEPTION 'ACTIVE_SHIFT_CONFLICT';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts WHERE staff_id = auth.uid() AND status = 'active' LIMIT 1;
    IF v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'PUTAWAY_DUTY_REQUIRED';
    END IF;

    -- Lock and load task for completion
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'TASK_NOT_IN_PROGRESS_BY_YOU';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'WAREHOUSE_MISMATCH';
    END IF;

    -- Verify authoritative internal FlashGO Product Barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
    END IF;
    IF v_product.internal_barcode IS NULL THEN
        RAISE EXCEPTION 'PRODUCT_HAS_NO_INTERNAL_BARCODE';
    END IF;
    IF v_product.internal_barcode != p_scanned_product_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- Verify authoritative Location QR
    SELECT * INTO v_scanned_location FROM public.warehouse_locations 
    WHERE barcode = p_scanned_location_qr AND is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;
    
    IF v_scanned_location.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'LOCATION_QR_INVALID';
    END IF;

    IF v_scanned_location.location_code != v_task.destination_location THEN
        RAISE EXCEPTION 'PUTAWAY_LOCATION_MISMATCH';
    END IF;

    -- Atomically update placement (creates physical inventory at the rack/shelf)
    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_scanned_location.id, v_task.product_id, v_task.quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    -- Legacy aggregate stock update
    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(v_task.destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    -- Complete task
    UPDATE public.putaway_tasks
    SET status = 'completed', completed_at = now()
    WHERE id = p_task_id;

    -- Audit log fix: Match LIVE schema exactly
    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, warehouse_id, metadata
    ) VALUES (
        auth.uid(), 'putaway_completed', 'putaway_task', p_task_id, v_task.warehouse_id,
        jsonb_build_object(
            'product_id', v_task.product_id, 
            'product_barcode', p_scanned_product_barcode, 
            'quantity', v_task.quantity, 
            'destination', v_task.destination_location, 
            'location_qr', p_scanned_location_qr, 
            'location_id', v_scanned_location.id
        )
    );

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;


-- 2. Restore missing audit log in warehouse_putaway_claim (from Migration 101)
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

    -- Atomically assign worker and update status
    UPDATE public.putaway_tasks
    SET status = 'in_progress',
        worker_id = v_worker_id,
        claimed_at = NOW()
    WHERE id = p_task_id;

    -- Allocate Destination atomicity check
    v_dest := public.warehouse_putaway_ensure_destination(p_task_id);

    -- Audit log fix: Match LIVE schema exactly
    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, warehouse_id, metadata
    ) VALUES (
        v_worker_id, 'putaway_claimed', 'putaway_task', p_task_id, v_shift.warehouse_id,
        jsonb_build_object('worker_id', v_worker_id)
    );

    RETURN jsonb_build_object('status', 'success', 'destination', v_dest);
END;
$$;


-- 3. Temporary READ-ONLY inspector for verification (will be used by the prompt response)
CREATE OR REPLACE FUNCTION public.temp_read_only_task_check(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_placement RECORD;
    v_stock RECORD;
BEGIN
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id;
    
    SELECT * INTO v_placement FROM public.warehouse_product_placements 
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    SELECT * INTO v_stock FROM public.warehouse_stock 
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    RETURN jsonb_build_object(
        'task', jsonb_build_object(
            'status', v_task.status,
            'worker_id', v_task.worker_id,
            'completed_at', v_task.completed_at,
            'destination_location', v_task.destination_location,
            'quantity', v_task.quantity
        ),
        'placement_quantity', v_placement.quantity,
        'stock_quantity', v_stock.quantity
    );
END;
$$;
