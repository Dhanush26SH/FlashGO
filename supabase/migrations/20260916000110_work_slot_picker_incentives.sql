-- 1. Extend work_slots
ALTER TABLE public.work_slots 
ADD COLUMN IF NOT EXISTS picker_incentive_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create the picker-specific incentive table
CREATE TABLE IF NOT EXISTS public.work_slot_picker_incentives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_slot_id UUID NOT NULL REFERENCES public.work_slots(id) ON DELETE CASCADE,
    target_items INTEGER NOT NULL CHECK (target_items > 0),
    reward_amount NUMERIC(10,2) NOT NULL CHECK (reward_amount >= 0),
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(work_slot_id, target_items),
    UNIQUE(work_slot_id, sort_order)
);

-- Enable RLS
ALTER TABLE public.work_slot_picker_incentives ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies (following FlashGO standard conventions)
-- Admin/Super Admin can manage
CREATE POLICY "Admins can manage picker incentives"
ON public.work_slot_picker_incentives
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('super_admin', 'warehouse_manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('super_admin', 'warehouse_manager')
  )
);

-- Any authenticated staff can read
CREATE POLICY "Staff can view picker incentives"
ON public.work_slot_picker_incentives
FOR SELECT
TO authenticated
USING (true);

-- 4. Atomic Admin RPC
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
    IF v_role NOT IN ('super_admin', 'warehouse_manager') THEN
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
