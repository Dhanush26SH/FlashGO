-- Migration: 20260916000116_cumulative_picker_incentives.sql
-- Description: Update calculate_picker_shift_earnings to sum incentives, and admin_save_work_slot_picker_incentives to not require ascending rewards.

-- 1. Update calculate_picker_shift_earnings
CREATE OR REPLACE FUNCTION public.calculate_picker_shift_earnings(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- Get cumulative achieved incentive (SUM of all achieved milestones)
    SELECT COALESCE(SUM(reward_amount), 0) INTO v_incentive_earnings
    FROM public.picker_shift_incentive_milestones
    WHERE shift_id = p_shift_id AND target_items <= v_items_picked;

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

-- 2. Update admin_save_work_slot_picker_incentives to remove ascending rewards check
CREATE OR REPLACE FUNCTION public.admin_save_work_slot_picker_incentives(p_work_slot_id uuid, p_enabled boolean, p_milestones jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_role TEXT;
    v_milestone JSONB;
    v_count INT;
    v_prev_target INT := 0;
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
$function$;
