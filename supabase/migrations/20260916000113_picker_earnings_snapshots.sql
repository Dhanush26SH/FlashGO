-- Migration: 20260916000113_picker_earnings_snapshots.sql
-- Description: Implement Picker authoritative earnings, snapshots, and idempotency.

-- 1. Schema Updates
ALTER TABLE public.work_slots ADD COLUMN picker_pay_rate NUMERIC(10,2) NULL;
ALTER TABLE public.staff_shifts ADD COLUMN picker_rate_snapshot NUMERIC(10,2) NULL;

CREATE TABLE public.picker_shift_incentive_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
    target_items INT NOT NULL CHECK (target_items > 0),
    reward_amount NUMERIC(10,2) NOT NULL CHECK (reward_amount >= 0),
    sort_order INT NOT NULL,
    UNIQUE (shift_id, target_items)
);

CREATE INDEX idx_picker_shift_incentive_milestones_shift_id ON public.picker_shift_incentive_milestones(shift_id);

-- RLS
ALTER TABLE public.picker_shift_incentive_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pickers can view their own milestones" ON public.picker_shift_incentive_milestones
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.staff_shifts 
        WHERE id = shift_id AND staff_id = auth.uid()
    )
);

CREATE POLICY "Admins can view milestones" ON public.picker_shift_incentive_milestones
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')
    )
);

-- 2. Drop old admin work slot RPC overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.admin_create_work_slot(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.admin_edit_work_slot(UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, NUMERIC, NUMERIC);

-- 3. Update admin_create_work_slot
CREATE OR REPLACE FUNCTION public.admin_create_work_slot(
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT,
    p_rate_min NUMERIC DEFAULT NULL,
    p_rate_max NUMERIC DEFAULT NULL,
    p_picker_pay_rate NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id UUID;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL THEN
        IF p_warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot create slot for another warehouse';
        END IF;
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    IF p_target_role = 'driver' AND p_status = 'published' THEN
        IF p_rate_min IS NULL OR p_rate_max IS NULL THEN
            RAISE EXCEPTION 'Driver gigs must have minimum and maximum estimated hourly rates when published';
        END IF;
        IF p_rate_min < 0 THEN
            RAISE EXCEPTION 'Minimum hourly rate cannot be negative';
        END IF;
        IF p_rate_max < p_rate_min THEN
            RAISE EXCEPTION 'Maximum hourly rate cannot be less than minimum hourly rate';
        END IF;
    END IF;

    IF p_target_role = 'picker' AND p_status = 'published' THEN
        IF p_picker_pay_rate IS NULL OR p_picker_pay_rate <= 0 THEN
            RAISE EXCEPTION 'Picker slots must have a positive pay rate';
        END IF;
    END IF;

    INSERT INTO public.work_slots (
        warehouse_id, target_role, start_time, end_time, capacity, status,
        estimated_hourly_rate_min, estimated_hourly_rate_max, picker_pay_rate
    )
    VALUES (
        p_warehouse_id, p_target_role, p_start_time, p_end_time, p_capacity, p_status,
        p_rate_min, p_rate_max, p_picker_pay_rate
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- 4. Update admin_edit_work_slot
CREATE OR REPLACE FUNCTION public.admin_edit_work_slot(
    p_slot_id UUID,
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT,
    p_rate_min NUMERIC DEFAULT NULL,
    p_rate_max NUMERIC DEFAULT NULL,
    p_picker_pay_rate NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slot RECORD;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL THEN
        IF v_slot.warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot edit slot from another warehouse';
        END IF;
        IF p_warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot move slot to another warehouse';
        END IF;
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    IF p_target_role = 'driver' AND p_status = 'published' THEN
        IF p_rate_min IS NULL OR p_rate_max IS NULL THEN
            RAISE EXCEPTION 'Driver gigs must have minimum and maximum estimated hourly rates when published';
        END IF;
        IF p_rate_min < 0 THEN
            RAISE EXCEPTION 'Minimum hourly rate cannot be negative';
        END IF;
        IF p_rate_max < p_rate_min THEN
            RAISE EXCEPTION 'Maximum hourly rate cannot be less than minimum hourly rate';
        END IF;
    END IF;

    IF p_target_role = 'picker' AND p_status = 'published' THEN
        IF p_picker_pay_rate IS NULL OR p_picker_pay_rate <= 0 THEN
            RAISE EXCEPTION 'Picker slots must have a positive pay rate';
        END IF;
    END IF;

    UPDATE public.work_slots
    SET
        warehouse_id = p_warehouse_id,
        target_role = p_target_role,
        start_time = p_start_time,
        end_time = p_end_time,
        capacity = p_capacity,
        status = p_status,
        estimated_hourly_rate_min = p_rate_min,
        estimated_hourly_rate_max = p_rate_max,
        picker_pay_rate = p_picker_pay_rate,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN true;
END;
$$;

-- 5. Update admin_save_work_slot_picker_incentives to enforce strictly increasing rewards
CREATE OR REPLACE FUNCTION public.admin_save_work_slot_picker_incentives(p_work_slot_id uuid, p_enabled boolean, p_milestones jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
    v_milestone JSONB;
    v_count INT;
    v_prev_target INT := 0;
    v_prev_reward NUMERIC := -1;
    v_target INT;
    v_reward NUMERIC;
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
        v_reward := (v_milestone->>'reward_amount')::NUMERIC;

        IF v_target <= 0 THEN
            RAISE EXCEPTION 'Target items must be > 0';
        END IF;
        IF v_reward < 0 THEN
            RAISE EXCEPTION 'Reward amount must be >= 0';
        END IF;
        
        -- Strictly ascending targets
        IF v_target <= v_prev_target THEN
            RAISE EXCEPTION 'Targets must be strictly ascending (duplicate or out-of-order target detected)';
        END IF;
        
        -- Strictly ascending rewards
        IF v_reward <= v_prev_reward THEN
            RAISE EXCEPTION 'Reward amounts must be strictly ascending';
        END IF;

        v_prev_target := v_target;
        v_prev_reward := v_reward;
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
$function$;


-- 6. Update picker_shift_check_in to take snapshot
CREATE OR REPLACE FUNCTION public.picker_shift_check_in(p_shift_id uuid, p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
    v_existing_token TEXT;
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    IF v_profile.role NOT IN ('picker', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Worker role not permitted to start picker shifts';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    IF v_shift.status = 'cancelled' OR v_shift.status = 'completed' THEN
        RAISE EXCEPTION 'Shift cannot be started in state: %', v_shift.status;
    END IF;

    -- Retrieve the associated work_slot for time validation
    SELECT * INTO v_slot FROM public.work_slots WHERE id = v_shift.work_slot_id;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Associated work slot not found';
    END IF;

    -- 3. Verify QR Token
    -- Check that the QR token belongs to the shift's warehouse and is not expired
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift.warehouse_id
      AND raw_token = p_qr_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NULL THEN
        RAISE EXCEPTION 'This QR does not belong to your booked store or is expired.';
    END IF;

    -- 4. Time Validation
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Activate Shift (Idempotent)
    IF v_shift.status != 'active' THEN
        UPDATE public.staff_shifts
        SET 
            status = 'active', 
            started_at = COALESCE(v_shift.started_at, now()),
            picker_rate_snapshot = COALESCE(v_shift.picker_rate_snapshot, v_slot.picker_pay_rate)
        WHERE id = p_shift_id;

        -- Idempotent snapshot of milestones (only targets > 0 and rewards >= 0 are saved by Admin UI)
        INSERT INTO public.picker_shift_incentive_milestones (shift_id, target_items, reward_amount, sort_order)
        SELECT p_shift_id, target_items, reward_amount, sort_order
        FROM public.work_slot_picker_incentives
        WHERE work_slot_id = v_slot.id
        ON CONFLICT (shift_id, target_items) DO NOTHING;
    END IF;

    -- 6. Set online status atomically (restored)
    -- Using the protected server-side mechanism
    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- 7. Create calculate_picker_shift_earnings RPC
CREATE OR REPLACE FUNCTION public.calculate_picker_shift_earnings(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_shift RECORD;
    v_items_picked INT;
    v_rate NUMERIC(10,2);
    v_base_earnings NUMERIC(10,2);
    v_incentive_earnings NUMERIC(10,2);
    v_total_earnings NUMERIC(10,2);
    v_role TEXT;
BEGIN
    -- Auth
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id;
    IF v_shift IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found');
    END IF;

    IF v_role NOT IN ('admin', 'warehouse_manager') AND v_shift.staff_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    v_items_picked := COALESCE(v_shift.items_picked, 0);
    v_rate := COALESCE(v_shift.picker_rate_snapshot, 0);
    
    v_base_earnings := v_items_picked * v_rate;

    -- Get highest achieved milestone
    SELECT reward_amount INTO v_incentive_earnings
    FROM public.picker_shift_incentive_milestones
    WHERE shift_id = p_shift_id AND target_items <= v_items_picked
    ORDER BY target_items DESC
    LIMIT 1;

    v_incentive_earnings := COALESCE(v_incentive_earnings, 0);
    v_total_earnings := v_base_earnings + v_incentive_earnings;

    RETURN jsonb_build_object(
        'success', true,
        'items_picked', v_items_picked,
        'rate_per_item', v_rate,
        'base_earnings', v_base_earnings,
        'achieved_incentive_reward', v_incentive_earnings,
        'total_earnings', v_total_earnings
    );
END;
$function$;
