-- 20260916000048_add_picker_assigned_at.sql

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS picker_assigned_at timestamptz;

-- Update trigger function
CREATE OR REPLACE FUNCTION public.trigger_auto_assign_picker()
RETURNS TRIGGER AS $$
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
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            NEW.picker_assigned_at := now();
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
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            NEW.picker_assigned_at := now();
            RETURN NEW;
        END IF;

        -- Priority 3: Unassigned (Leave as NULL)
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update manual assign function
CREATE OR REPLACE FUNCTION public.auto_assign_picker(p_order_id UUID)
RETURNS VOID AS $$
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
        SET picker_id = v_picker_id,
            picker_assigned_at = now()
        WHERE id = p_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
