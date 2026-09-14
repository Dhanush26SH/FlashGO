-- Correct the previously incorrect 'super_admin' role to 'admin'

-- Fix policies
DROP POLICY IF EXISTS "Admins can manage picker incentives" ON public.work_slot_picker_incentives;

CREATE POLICY "Admins can manage picker incentives"
ON public.work_slot_picker_incentives
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'warehouse_manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'warehouse_manager')
  )
);

-- Fix RPC role validation
CREATE OR REPLACE FUNCTION public.admin_save_work_slot_picker_incentives(
    p_work_slot_id UUID,
    p_enabled BOOLEAN,
    p_milestones JSONB -- Expected: [{"target_items": 175, "reward_amount": 25, "sort_order": 1}, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_milestone JSONB;
    v_count INT;
    v_prev_target INT := 0;
    v_target INT;
BEGIN
    -- Validate admin
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Basic validation
    v_count := jsonb_array_length(p_milestones);
    IF v_count > 4 THEN
        RAISE EXCEPTION 'Maximum 4 milestones allowed per work slot.';
    END IF;

    -- Validate milestones are strictly ascending targets and >=0 reward
    FOR v_milestone IN SELECT * FROM jsonb_array_elements(p_milestones)
    LOOP
        v_target := (v_milestone->>'target_items')::INT;
        IF v_target <= 0 THEN
            RAISE EXCEPTION 'Target items must be > 0';
        END IF;
        IF (v_milestone->>'reward_amount')::NUMERIC < 0 THEN
            RAISE EXCEPTION 'Reward amount must be >= 0';
        END IF;
        
        -- Since we order them by sort_order from frontend, we just ensure targets go up
        IF v_target <= v_prev_target THEN
            RAISE EXCEPTION 'Targets must be strictly ascending (duplicate or out-of-order target detected)';
        END IF;
        v_prev_target := v_target;
    END LOOP;

    -- Atomic save
    UPDATE public.work_slots
    SET picker_incentive_enabled = p_enabled,
        updated_at = now()
    WHERE id = p_work_slot_id;

    -- Replace milestones entirely
    DELETE FROM public.work_slot_picker_incentives WHERE work_slot_id = p_work_slot_id;
    
    IF p_milestones IS NOT NULL AND jsonb_array_length(p_milestones) > 0 THEN
        INSERT INTO public.work_slot_picker_incentives (work_slot_id, target_items, reward_amount, sort_order)
        SELECT p_work_slot_id, 
               (m->>'target_items')::INT, 
               (m->>'reward_amount')::NUMERIC, 
               (m->>'sort_order')::INT
        FROM jsonb_array_elements(p_milestones) AS m;
    END IF;
END;
$$;

-- Fix RPC return type issue by explicitly dropping it first
DROP FUNCTION IF EXISTS public.admin_get_work_slots();

CREATE OR REPLACE FUNCTION public.admin_get_work_slots()
RETURNS TABLE (
    id UUID,
    warehouse_id UUID,
    warehouse_name TEXT,
    target_role TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    capacity INT,
    status TEXT,
    booked_count BIGINT,
    estimated_hourly_rate_min NUMERIC,
    estimated_hourly_rate_max NUMERIC,
    picker_incentive_enabled BOOLEAN,
    picker_incentives JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        w.name AS warehouse_name,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        ws.status,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count,
        ws.estimated_hourly_rate_min,
        ws.estimated_hourly_rate_max,
        ws.picker_incentive_enabled,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'target_items', inc.target_items,
                'reward_amount', inc.reward_amount,
                'sort_order', inc.sort_order
            ) ORDER BY inc.sort_order)
             FROM public.work_slot_picker_incentives inc
             WHERE inc.work_slot_id = ws.id), 
            '[]'::jsonb
        ) AS picker_incentives
    FROM public.work_slots ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE (v_profile.warehouse_id IS NULL OR ws.warehouse_id = v_profile.warehouse_id)
    ORDER BY ws.start_time DESC;
END;
$$;
