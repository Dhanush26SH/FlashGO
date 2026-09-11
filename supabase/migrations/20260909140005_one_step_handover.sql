-- Migration 20260909140005_one_step_handover.sql

-- 1. Create mark_order_packed_for_handover
CREATE OR REPLACE FUNCTION public.mark_order_packed_for_handover(
    p_order_id UUID,
    p_picker_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_picked_qty INTEGER;
    v_sub_picked_qty INTEGER;
    v_is_suspended BOOLEAN;
    v_valid_role BOOLEAN;
BEGIN
    SELECT COALESCE(is_suspended, FALSE), role IN ('picker', 'admin', 'warehouse_manager', 'warehouse_staff') 
    INTO v_is_suspended, v_valid_role
    FROM public.profiles WHERE id = p_picker_id;

    IF NOT v_valid_role THEN
        RAISE EXCEPTION 'Unauthorized: User is not a picker or staff';
    END IF;
    IF v_is_suspended THEN
        RAISE EXCEPTION 'Account is suspended.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'packed' THEN RETURN; END IF;
    IF v_order.status != 'picking' THEN
        RAISE EXCEPTION 'Order cannot be marked packed from status: %', v_order.status;
    END IF;
    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Wrong picker';
    END IF;

    -- Verify all items are picked (identical to complete_picking)
    FOR v_item IN 
        SELECT id, product_id, quantity, status
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_picked_qty
        FROM public.stock_ledgers
        WHERE order_id = p_order_id 
          AND product_id = v_item.product_id 
          AND reason IN ('picking', 'picking_undo');

        IF v_picked_qty < v_item.quantity THEN
            SELECT ABS(COALESCE(SUM(sl.quantity_change), 0)) INTO v_sub_picked_qty
            FROM public.order_substitutions os
            JOIN public.stock_ledgers sl ON sl.order_id = os.order_id AND sl.product_id = os.suggested_product_id
            WHERE os.order_id = p_order_id
              AND os.original_item_id = v_item.product_id
              AND os.status = 'approved'
              AND sl.reason IN ('picking', 'picking_undo');

            IF (v_picked_qty + v_sub_picked_qty) < v_item.quantity THEN
                IF v_item.status != 'out_of_stock' THEN
                    RAISE EXCEPTION 'Order item % is not fully picked and not marked out_of_stock', v_item.product_id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    -- Ensure no pending substitutions
    IF EXISTS (
        SELECT 1 FROM public.order_substitutions 
        WHERE order_id = p_order_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Cannot complete picking: Unresolved substitutions exist.';
    END IF;

    UPDATE public.orders 
    SET status = 'packed', updated_at = now()
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update trigger_assign_next_order to only release at handed_off or cancelled
CREATE OR REPLACE FUNCTION public.trigger_assign_next_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
    v_picker_role TEXT;
BEGIN
    -- Only release worker when status goes from busy to free (handed_off, delivered, cancelled)
    -- busy statuses: placed, picking, waiting_for_packing, packing, packed, staged
    -- free statuses: handed_off, out_for_delivery, delivered, cancelled
    IF OLD.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged') 
       AND NEW.status IN ('handed_off', 'out_for_delivery', 'delivered', 'cancelled', 'failed', 'returned', 'rejected') 
       AND OLD.picker_id IS NOT NULL THEN
        
        -- Get the picker's role
        SELECT role INTO v_picker_role FROM public.profiles WHERE id = OLD.picker_id;

        -- Check if they are still online, eligible, and not suspended
        IF EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = OLD.picker_id 
              AND is_online = true 
              AND COALESCE(is_suspended, false) = false
              AND (
                  (role = 'picker' AND public.is_worker_eligible_for_assignment(OLD.picker_id) = true)
                  OR 
                  (role = 'warehouse_staff')
              )
        ) THEN
            -- Assign the oldest unassigned placed order in the same warehouse
            SELECT id INTO v_next_order_id
            FROM public.orders
            WHERE warehouse_id = NEW.warehouse_id
              AND status = 'placed'
              AND picker_id IS NULL
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF v_next_order_id IS NOT NULL THEN
                UPDATE public.orders
                SET picker_id = OLD.picker_id
                WHERE id = v_next_order_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- 3. Update auto_assign_picker to consider all busy statuses
CREATE OR REPLACE FUNCTION public.auto_assign_picker(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_picker_id UUID;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order.id IS NULL OR v_order.picker_id IS NOT NULL OR v_order.status != 'placed' THEN
        RETURN;
    END IF;

    -- Priority 1: Dedicated Picker
    SELECT p.id INTO v_picker_id
    FROM public.profiles p
    WHERE p.role = 'picker' 
      AND p.warehouse_id = v_order.warehouse_id
      AND p.is_online = true
      AND COALESCE(p.is_suspended, false) = false
      AND public.is_worker_eligible_for_assignment(p.id) = true
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o 
          WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
      )
    ORDER BY p.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_picker_id IS NULL THEN
        -- Priority 2: Warehouse Staff Fallback
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'warehouse_staff' 
          AND p.warehouse_id = v_order.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
    END IF;

    IF v_picker_id IS NOT NULL THEN
        UPDATE public.orders
        SET picker_id = v_picker_id
        WHERE id = p_order_id;
    END IF;
END;
$function$;


-- 4. Create execute_worker_handover
CREATE OR REPLACE FUNCTION public.execute_worker_handover(
    p_order_id UUID,
    p_picker_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_trip RECORD;
    v_is_suspended BOOLEAN;
    v_valid_role BOOLEAN;
BEGIN
    SELECT COALESCE(is_suspended, FALSE), role IN ('picker', 'admin', 'warehouse_manager', 'warehouse_staff') 
    INTO v_is_suspended, v_valid_role
    FROM public.profiles WHERE id = p_picker_id;

    IF NOT v_valid_role THEN
        RAISE EXCEPTION 'Unauthorized: User is not a picker or staff';
    END IF;
    IF v_is_suspended THEN
        RAISE EXCEPTION 'Account is suspended.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Idempotency check
    IF v_order.status IN ('handed_off', 'out_for_delivery', 'delivered') THEN 
        RETURN; 
    END IF;

    IF v_order.status IN ('cancelled', 'failed', 'returned', 'rejected') THEN
        RAISE EXCEPTION 'Order is cancelled or failed';
    END IF;

    IF v_order.status NOT IN ('packed', 'staged') THEN
        RAISE EXCEPTION 'Order cannot be handed over from status: %', v_order.status;
    END IF;

    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Wrong picker';
    END IF;

    IF v_order.driver_id IS NULL OR v_order.trip_id IS NULL THEN
        RAISE EXCEPTION 'Cannot hand over: No driver assigned';
    END IF;

    -- Verify trip is active and matches driver
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = v_order.trip_id;
    IF v_trip.id IS NULL THEN
        RAISE EXCEPTION 'Cannot hand over: Invalid trip';
    END IF;
    IF v_trip.driver_id != v_order.driver_id THEN
        RAISE EXCEPTION 'Cannot hand over: Trip driver mismatch';
    END IF;
    IF v_trip.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot hand over: Trip is cancelled';
    END IF;

    -- Update order to handed_off. 
    -- This fires trigger_assign_next_order which releases the worker and assigns next order
    UPDATE public.orders 
    SET status = 'handed_off', 
        updated_at = now()
    WHERE id = p_order_id;
    
    BEGIN
        EXECUTE 'UPDATE public.orders SET handed_off_by = $1, handed_off_at = now() WHERE id = $2'
        USING p_picker_id, p_order_id;
    EXCEPTION WHEN undefined_column THEN
        -- ignore if columns don't exist
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
