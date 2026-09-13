-- 20260916000066_secure_handover_context.sql

-- 1. Add handed_off to enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'handed_off' AFTER 'packed';

-- 2. Update trigger_assign_next_order to release picker on handed_off
CREATE OR REPLACE FUNCTION public.trigger_assign_next_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
    v_picker_role TEXT;
BEGIN
    -- Only release worker when status goes from busy to free
    -- busy statuses: placed, picking, packed
    -- free statuses: handed_off, out_for_delivery, delivered, cancelled
    IF OLD.status IN ('placed', 'picking', 'packed') 
       AND NEW.status IN ('handed_off', 'out_for_delivery', 'delivered', 'cancelled') 
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

-- 3. Update auto_assign_picker to consider handed_off as free
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

-- 4. Update execute_worker_handover
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
    IF v_order.status IN ('handed_off', 'out_for_delivery', 'delivered') THEN 
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
        -- ignore if columns don't exist yet
    END;
    
    -- NOTE: Intentionally NOT updating logistics_trips to 'in_transit' yet.
    -- That happens when the driver confirms pickup.
END;
$$;


-- 5. Create secure handover context RPC
CREATE OR REPLACE FUNCTION public.get_order_handover_context(p_order_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_order RECORD;
    v_trip RECORD;
    v_driver RECORD;
    res json;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;
    
    -- Check Authorization: must be the assigned picker OR an admin/warehouse manager
    IF v_order.picker_id != v_caller_id AND v_caller_role NOT IN ('admin', 'warehouse_manager', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_order.trip_id IS NOT NULL THEN
        SELECT * INTO v_trip FROM public.logistics_trips WHERE id = v_order.trip_id;
    END IF;

    IF v_order.driver_id IS NOT NULL THEN
        SELECT full_name, employee_id, phone INTO v_driver FROM public.profiles WHERE id = v_order.driver_id;
    END IF;

    SELECT json_build_object(
        'driver_id', v_order.driver_id,
        'full_name', v_driver.full_name,
        'employee_id', v_driver.employee_id,
        'phone', v_driver.phone,
        'order_status', v_order.status,
        'trip_status', v_trip.status,
        'bag_number', v_order.bag_number,
        'order_number', v_order.order_number
    ) INTO res;
    
    RETURN res;
END;
$$;
