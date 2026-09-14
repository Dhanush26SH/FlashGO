-- Migration 94: Fix putaway inventory accounting and strict destination validation

CREATE OR REPLACE FUNCTION public.warehouse_putaway_complete(
    p_task_id UUID,
    p_scanned_barcode TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_task RECORD;
    v_product RECORD;
    v_location RECORD;
BEGIN
    -- Validate worker and state
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' OR v_profile.warehouse_is_online = false THEN
        RAISE EXCEPTION 'Worker must be online warehouse staff';
    END IF;

    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shift IS NULL OR v_active_shift.current_duty != 'putaway' THEN
        RAISE EXCEPTION 'Invalid shift or duty state';
    END IF;

    -- Lock and load task
    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.status != 'in_progress' OR v_task.worker_id != auth.uid() THEN
        RAISE EXCEPTION 'Task is not in_progress by you';
    END IF;
    IF v_task.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;

    -- Verify product barcode
    SELECT * INTO v_product FROM public.products WHERE id = v_task.product_id;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_product.barcode != p_scanned_barcode THEN
        RAISE EXCEPTION 'BARCODE_MISMATCH';
    END IF;

    -- STRICT DESTINATION VALIDATION
    SELECT * INTO v_location FROM public.warehouse_locations 
    WHERE location_code = v_task.destination_location AND warehouse_id = v_task.warehouse_id
    LIMIT 1;

    IF v_location IS NULL THEN
        -- Rollback entirely
        RAISE EXCEPTION 'DESTINATION_LOCATION_NOT_FOUND';
    END IF;

    -- Atomically update placement (creates physical inventory at the rack/shelf)
    -- We do NOT decrement an unplaced staging record here because GRN does not yet create staging records in placements.
    INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
    VALUES (v_task.warehouse_id, v_location.id, v_task.product_id, v_task.quantity, 'putaway')
    ON CONFLICT (location_id, product_id) 
    DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

    -- Legacy aggregate stock update
    -- Note: GRN already incremented warehouse_stock.quantity. 
    -- We only update the text location for backward compatibility. We do NOT increment quantity here.
    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(v_task.destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;

    -- Complete task
    UPDATE public.putaway_tasks
    SET 
        status = 'completed',
        completed_at = now()
    WHERE id = p_task_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, entity, entity_id, details
    ) VALUES (
        auth.uid(), 'putaway_completed', 'putaway_task', p_task_id, 
        jsonb_build_object('product_id', v_task.product_id, 'barcode', p_scanned_barcode, 'quantity', v_task.quantity, 'destination', v_task.destination_location, 'location_id', v_location.id)
    );

    RETURN jsonb_build_object('status', 'success', 'task_id', p_task_id);
END;
$$;
