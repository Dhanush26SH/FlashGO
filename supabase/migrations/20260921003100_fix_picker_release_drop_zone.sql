-- Migration: 20260921003100_fix_picker_release_drop_zone.sql
-- Relieve Pickers from orders that are safely placed in Drop Zones

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
            AND NOT EXISTS (
                SELECT 1 FROM public.drop_zone_allocations dza
                WHERE dza.order_id = o.id 
                  AND dza.picker_id = p.id
                  AND dza.status IN ('placed', 'driver_assigned', 'picked_up')
            )
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
                AND NOT EXISTS (
                    SELECT 1 FROM public.drop_zone_allocations dza
                    WHERE dza.order_id = o.id 
                      AND dza.picker_id = p.id
                      AND dza.status IN ('placed', 'driver_assigned', 'picked_up')
                )
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
    END IF;

    IF v_picker_id IS NOT NULL THEN
        UPDATE public.orders
        SET picker_id = v_picker_id,
            picker_assigned_at = now()
        WHERE id = p_order_id;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_quick_commerce_auto_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_picker_id UUID;
    v_picker_role TEXT;
BEGIN
    -- Only auto-assign for placed orders that don't have a picker yet
    IF NEW.status = 'placed' AND NEW.picker_id IS NULL THEN
        -- Priority 1: Dedicated Picker
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'picker' 
          AND p.warehouse_id = NEW.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND public.is_worker_eligible_for_assignment(p.id) = true
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'packed')
                AND NOT EXISTS (
                    SELECT 1 FROM public.drop_zone_allocations dza
                    WHERE dza.order_id = o.id 
                      AND dza.picker_id = p.id
                      AND dza.status IN ('placed', 'driver_assigned', 'picked_up')
                )
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            NEW.picker_assigned_at := now();
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
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'packed')
                AND NOT EXISTS (
                    SELECT 1 FROM public.drop_zone_allocations dza
                    WHERE dza.order_id = o.id 
                      AND dza.picker_id = p.id
                      AND dza.status IN ('placed', 'driver_assigned', 'picked_up')
                )
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            NEW.picker_assigned_at := now();
            RETURN NEW;
        END IF;
    END IF;

    -- If order is moving out of an active picking state
    IF OLD.status IN ('placed', 'picking', 'packed') 
       AND NEW.status NOT IN ('placed', 'picking', 'packed') 
       AND OLD.picker_id IS NOT NULL THEN
       
        SELECT role INTO v_picker_role FROM public.profiles WHERE id = OLD.picker_id;

        -- Reassign a new pending order to this picker if they are eligible
        IF v_picker_role = 'picker' AND public.is_worker_eligible_for_assignment(OLD.picker_id) = true THEN
            UPDATE public.orders
            SET picker_id = OLD.picker_id,
                picker_assigned_at = now()
            WHERE id = (
                SELECT id FROM public.orders 
                WHERE warehouse_id = OLD.warehouse_id 
                  AND status = 'placed' 
                  AND picker_id IS NULL
                ORDER BY created_at ASC 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.picker_confirm_drop_zone(p_order_id UUID, p_warehouse_id UUID, p_qr_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_picker_id UUID := auth.uid();
    v_allocation RECORD;
    v_drop_zone RECORD;
BEGIN
    SELECT dza.* INTO v_allocation FROM public.drop_zone_allocations dza 
    WHERE dza.order_id = p_order_id AND dza.picker_id = v_picker_id AND dza.status = 'allocated' FOR UPDATE;
    
    IF v_allocation.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ALLOCATION');
    END IF;

    SELECT * INTO v_drop_zone FROM public.drop_zones WHERE id = v_allocation.drop_zone_id;
    
    IF v_drop_zone.warehouse_id != p_warehouse_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WAREHOUSE');
    END IF;

    IF v_drop_zone.is_active != true THEN
        RETURN jsonb_build_object('success', false, 'code', 'INACTIVE_ZONE');
    END IF;

    IF v_drop_zone.qr_token::text != p_qr_token THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    UPDATE public.drop_zone_allocations SET status = 'placed', placed_at = NOW() WHERE id = v_allocation.id;

    -- The picker is now eligible for a new task. Auto-assign the next pending order.
    IF public.is_worker_eligible_for_assignment(v_picker_id) = true THEN
        UPDATE public.orders
        SET picker_id = v_picker_id,
            picker_assigned_at = NOW()
        WHERE id = (
            SELECT id FROM public.orders 
            WHERE warehouse_id = v_drop_zone.warehouse_id 
              AND status = 'placed' 
              AND picker_id IS NULL
            ORDER BY created_at ASC 
            LIMIT 1 
            FOR UPDATE SKIP LOCKED
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
