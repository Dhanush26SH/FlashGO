-- Migration A: Quick-Commerce Assignment Architecture

-- Recreate trigger_auto_assign_picker to use the Priority 1/2/3 logic atomically
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
        -- Priority 1: Dedicated Picker (role='picker', online, not suspended, zero active picking tasks)
        -- We use FOR UPDATE SKIP LOCKED to prevent concurrent orders from assigning to the same picker
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'picker' 
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

        -- Priority 2: Warehouse Staff Fallback
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

-- Update auto_assign_picker for manual invocation (RPC) if used elsewhere
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

-- Trigger for Next Order Auto-Assignment (When Task Completes)
CREATE OR REPLACE FUNCTION public.trigger_assign_next_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
BEGIN
    -- If an assignee's active task ends (placed/picking -> something else)
    IF OLD.status IN ('placed', 'picking') AND NEW.status NOT IN ('placed', 'picking') AND OLD.picker_id IS NOT NULL THEN
        -- Check if they are still online and eligible (they might have gone offline mid-pick)
        IF EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = OLD.picker_id 
              AND is_online = true 
              AND COALESCE(is_suspended, false) = false
              AND role IN ('picker', 'warehouse_staff')
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

DROP TRIGGER IF EXISTS assign_next_order_trigger ON public.orders;
CREATE TRIGGER assign_next_order_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IN ('placed', 'picking') AND NEW.status NOT IN ('placed', 'picking') AND OLD.picker_id IS NOT NULL)
EXECUTE FUNCTION public.trigger_assign_next_order();

-- Trigger for Next Order Auto-Assignment (When Worker Goes Online)
CREATE OR REPLACE FUNCTION public.trigger_worker_goes_online()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_next_order_id UUID;
BEGIN
    IF NEW.is_online = true AND (OLD.is_online = false OR OLD.is_online IS NULL) AND NEW.role IN ('picker', 'warehouse_staff') THEN
        -- Only assign if they have zero active orders
        IF NOT EXISTS (
            SELECT 1 FROM public.orders 
            WHERE picker_id = NEW.id AND status IN ('placed', 'picking')
        ) THEN
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
                SET picker_id = NEW.id
                WHERE id = v_next_order_id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS worker_goes_online_trigger ON public.profiles;
CREATE TRIGGER worker_goes_online_trigger
AFTER UPDATE OF is_online ON public.profiles
FOR EACH ROW
WHEN (NEW.is_online = true AND (OLD.is_online = false OR OLD.is_online IS NULL) AND NEW.role IN ('picker', 'warehouse_staff'))
EXECUTE FUNCTION public.trigger_worker_goes_online();
