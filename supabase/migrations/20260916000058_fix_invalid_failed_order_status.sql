-- 20260916000058_fix_invalid_failed_order_status.sql
-- Fix invalid enum 'failed', 'returned', 'rejected', 'handed_off', 'staged', 'waiting_for_packing', 'packing' used with order_status

-- 1. Update trigger_assign_next_order
CREATE OR REPLACE FUNCTION public.trigger_assign_next_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
    v_picker_role TEXT;
BEGIN
    -- Only release worker when status goes from busy to free (out_for_delivery, delivered, cancelled)
    -- busy statuses: placed, picking, packed
    -- free statuses: out_for_delivery, delivered, cancelled
    IF OLD.status IN ('placed', 'picking', 'packed') 
       AND NEW.status IN ('out_for_delivery', 'delivered', 'cancelled') 
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

-- 2. Update auto_assign_picker
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
          WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'packed')
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
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'packed')
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

-- 3. Update execute_worker_handover
CREATE OR REPLACE FUNCTION public.execute_worker_handover(
    p_order_id UUID,
    p_picker_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    IF v_order.status IN ('out_for_delivery', 'delivered') THEN 
        RETURN; 
    END IF;

    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'Order is cancelled';
    END IF;

    IF v_order.status != 'packed' THEN
        RAISE EXCEPTION 'Order cannot be handed over from status: %', v_order.status;
    END IF;

    -- verify the authenticated picker actually owns this order
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

    -- Update order to out_for_delivery.
    -- This fires trigger_assign_next_order which releases the worker and assigns next order
    UPDATE public.orders 
    SET status = 'out_for_delivery', 
        updated_at = now()
    WHERE id = p_order_id;
    
    BEGIN
        EXECUTE 'UPDATE public.orders SET handed_off_by = $1, handed_off_at = now() WHERE id = $2'
        USING p_picker_id, p_order_id;
    EXCEPTION WHEN undefined_column THEN
        -- ignore if columns don't exist yet
    END;
    
    -- Also update the logistics_trip to in_transit if it is still accepted
    UPDATE public.logistics_trips
    SET status = 'in_transit', updated_at = now()
    WHERE id = v_order.trip_id AND status = 'accepted';
END;
$$;
