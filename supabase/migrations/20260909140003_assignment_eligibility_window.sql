-- Migration: Assignment Eligibility Window (+5 Min Rule)

-- 1. Helper Function: Reconcile Worker Shifts
CREATE OR REPLACE FUNCTION public.reconcile_worker_shifts(p_staff_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_shift RECORD;
    v_next_shift RECORD;
    v_changes_made BOOLEAN;
BEGIN
    LOOP
        v_changes_made := false;

        -- Find an active shift that has reached its end_time
        FOR v_active_shift IN 
            SELECT * FROM public.staff_shifts 
            WHERE staff_id = p_staff_id AND status = 'active' AND now() >= shift_end
            FOR UPDATE
        LOOP
            -- Look for an exactly consecutive booked shift
            SELECT * INTO v_next_shift 
            FROM public.staff_shifts
            WHERE staff_id = p_staff_id 
              AND status = 'booked' 
              AND shift_start = v_active_shift.shift_end
            FOR UPDATE
            LIMIT 1;

            IF FOUND THEN
                -- Transition seamlessly to consecutive shift
                UPDATE public.staff_shifts SET status = 'completed', updated_at = now() WHERE id = v_active_shift.id;
                UPDATE public.staff_shifts SET status = 'active', updated_at = now() WHERE id = v_next_shift.id;
                v_changes_made := true;
            ELSE
                -- No consecutive shift. Check if +5 minutes have expired.
                IF now() >= v_active_shift.shift_end + interval '5 minutes' THEN
                    UPDATE public.staff_shifts SET status = 'completed', updated_at = now() WHERE id = v_active_shift.id;
                    v_changes_made := true;
                END IF;
            END IF;
        END LOOP;

        EXIT WHEN NOT v_changes_made;
    END LOOP;
END;
$$;

-- 2. Helper Function: Is Worker Eligible for Assignment
CREATE OR REPLACE FUNCTION public.is_worker_eligible_for_assignment(p_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_eligible BOOLEAN := false;
BEGIN
    -- 1. Reconcile shifts first (authoritative state update)
    PERFORM public.reconcile_worker_shifts(p_staff_id);

    -- 2. Check if they have a valid active shift within the allowed window
    SELECT EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = p_staff_id
          AND status = 'active'
          AND now() < shift_end + interval '5 minutes'
    ) INTO v_is_eligible;

    RETURN v_is_eligible;
END;
$$;

-- 3. Update trigger_auto_assign_picker
CREATE OR REPLACE FUNCTION public.trigger_auto_assign_picker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_picker_id UUID;
BEGIN
    -- Only assign if placed and no picker
    IF NEW.status = 'placed' AND NEW.picker_id IS NULL THEN
        -- Priority 1: Dedicated Picker (role='picker', online, not suspended, zero active picking tasks, eligible shift)
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'picker' 
          AND p.warehouse_id = NEW.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND public.is_worker_eligible_for_assignment(p.id) = true
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            RETURN NEW;
        END IF;

        -- Priority 2: Warehouse Staff Fallback (unchanged, shift logic not applied)
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'warehouse_staff' 
          AND p.warehouse_id = NEW.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            RETURN NEW;
        END IF;

        -- Priority 3: Unassigned (Leave as NULL)
    END IF;
    RETURN NEW;
END;
$function$;

-- 4. Update auto_assign_picker
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
          WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking')
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
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking')
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

-- 5. Update trigger_assign_next_order
CREATE OR REPLACE FUNCTION public.trigger_assign_next_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
    v_picker_role TEXT;
BEGIN
    -- If an assignee's active task ends (placed/picking -> something else)
    IF OLD.status IN ('placed', 'picking') AND NEW.status NOT IN ('placed', 'picking') AND OLD.picker_id IS NOT NULL THEN
        
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
