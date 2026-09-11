-- Phase 17.2: Auto-Assign Picker

CREATE OR REPLACE FUNCTION auto_assign_picker(p_order_id UUID) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_picker_id UUID;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order.id IS NULL OR v_order.picker_id IS NOT NULL OR v_order.status != 'placed' THEN
        RETURN;
    END IF;

    -- Find an eligible picker
    -- role = picker, not suspended, same warehouse, optionally is_online
    -- For simplicity, least active currently assigned to placed/picking orders
    SELECT p.id INTO v_picker_id
    FROM public.profiles p
    LEFT JOIN public.orders o ON o.picker_id = p.id AND o.status IN ('placed', 'picking')
    WHERE p.role = 'picker' 
      AND COALESCE(p.is_suspended, FALSE) = FALSE
      AND p.warehouse_id = v_order.warehouse_id
    GROUP BY p.id
    ORDER BY COUNT(o.id) ASC
    LIMIT 1;

    IF v_picker_id IS NOT NULL THEN
        UPDATE public.orders
        SET picker_id = v_picker_id
        WHERE id = p_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-assign on order creation
CREATE OR REPLACE FUNCTION trigger_auto_assign_picker() RETURNS TRIGGER AS $$
BEGIN
    -- Only assign if placed and no picker
    IF NEW.status = 'placed' AND NEW.picker_id IS NULL THEN
        -- We cannot easily lock the table from within a row trigger safely without careful design,
        -- but since we're just updating the current row in a BEFORE trigger, we can just find one.
        -- Wait, better to do AFTER trigger to let checkout commit first, or just do it in BEFORE trigger.
        
        DECLARE
            v_picker_id UUID;
        BEGIN
            SELECT p.id INTO v_picker_id
            FROM public.profiles p
            LEFT JOIN public.orders o ON o.picker_id = p.id AND o.status IN ('placed', 'picking')
            WHERE p.role = 'picker' 
              AND COALESCE(p.is_suspended, FALSE) = FALSE
              AND p.warehouse_id = NEW.warehouse_id
            GROUP BY p.id
            ORDER BY COUNT(o.id) ASC
            LIMIT 1;

            IF v_picker_id IS NOT NULL THEN
                NEW.picker_id := v_picker_id;
            END IF;
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_assign_picker_on_insert ON public.orders;
CREATE TRIGGER trigger_assign_picker_on_insert
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION trigger_auto_assign_picker();
