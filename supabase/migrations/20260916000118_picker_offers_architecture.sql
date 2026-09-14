-- Migration: 20260916000118_picker_offers_architecture.sql

-- 1. Add completed_at to staff_shifts
ALTER TABLE public.staff_shifts ADD COLUMN completed_at TIMESTAMPTZ NULL;

-- 2. Weekly Item Picking Target (No monetary reward, progress only)
CREATE TABLE public.picker_weekly_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_items INT NOT NULL CHECK (target_items > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.picker_weekly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read weekly targets" ON public.picker_weekly_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage weekly targets" ON public.picker_weekly_targets FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

-- 3. Admin-Created Bonus Offers
CREATE TABLE public.picker_bonus_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    target_type TEXT NOT NULL DEFAULT 'completed_slots',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_bonus_target_type CHECK (target_type IN ('completed_slots'))
);
ALTER TABLE public.picker_bonus_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read bonus offers" ON public.picker_bonus_offers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage bonus offers" ON public.picker_bonus_offers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

CREATE TABLE public.picker_bonus_offer_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID NOT NULL REFERENCES public.picker_bonus_offers(id) ON DELETE CASCADE,
    target_value INT NOT NULL CHECK (target_value > 0),
    reward_amount NUMERIC(10,2) NOT NULL CHECK (reward_amount >= 0),
    sort_order INT NOT NULL
);
ALTER TABLE public.picker_bonus_offer_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read bonus milestones" ON public.picker_bonus_offer_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage bonus milestones" ON public.picker_bonus_offer_milestones FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

-- 4. Immutable Bonus Awards Ledger
CREATE TABLE public.picker_bonus_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES public.picker_bonus_offers(id) ON DELETE RESTRICT,
    period_key TEXT NOT NULL,
    milestone_id UUID NOT NULL REFERENCES public.picker_bonus_offer_milestones(id) ON DELETE RESTRICT,
    offer_name_snapshot TEXT NOT NULL,
    milestone_target INT NOT NULL,
    configured_total_reward NUMERIC(10,2) NOT NULL CHECK (configured_total_reward >= 0),
    incremental_award_amount NUMERIC(10,2) NOT NULL CHECK (incremental_award_amount >= 0),
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    earning_date DATE NOT NULL,
    UNIQUE (staff_id, offer_id, period_key, milestone_id)
);
ALTER TABLE public.picker_bonus_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own awards" ON public.picker_bonus_awards FOR SELECT TO authenticated USING (staff_id = auth.uid());
CREATE POLICY "Admins read awards" ON public.picker_bonus_awards FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

-- 5. Trigger: Lock Active Offer Mutations
CREATE OR REPLACE FUNCTION public.check_active_offer_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_date DATE;
BEGIN
    IF TG_TABLE_NAME = 'picker_bonus_offers' THEN
        IF TG_OP = 'DELETE' THEN
            v_start_date := OLD.start_date;
        ELSE
            v_start_date := NEW.start_date;
        END IF;
    ELSIF TG_TABLE_NAME = 'picker_bonus_offer_milestones' THEN
        SELECT start_date INTO v_start_date FROM public.picker_bonus_offers WHERE id = COALESCE(NEW.offer_id, OLD.offer_id);
    END IF;

    IF (now() AT TIME ZONE 'Asia/Kolkata')::DATE >= v_start_date THEN
        RAISE EXCEPTION 'Cannot modify financial terms of an active or historical bonus offer (start_date %)', v_start_date;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER prevent_active_offer_mutation
BEFORE UPDATE OR DELETE ON public.picker_bonus_offers
FOR EACH ROW EXECUTE FUNCTION public.check_active_offer_mutation();

CREATE TRIGGER prevent_active_milestone_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.picker_bonus_offer_milestones
FOR EACH ROW EXECUTE FUNCTION public.check_active_offer_mutation();

-- 6. Helper: Evaluate Bonus Offers
CREATE OR REPLACE FUNCTION public.evaluate_picker_bonus_offers(
    p_staff_id UUID,
    p_completed_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offer RECORD;
    v_milestone RECORD;
    v_completion_date DATE := (p_completed_at AT TIME ZONE 'Asia/Kolkata')::DATE;
    v_completed_slots INT;
    v_already_awarded NUMERIC(10,2);
    v_award_delta NUMERIC(10,2);
    v_period_key TEXT;
BEGIN
    -- Only evaluate active offers whose date range includes the completion date
    FOR v_offer IN 
        SELECT * FROM public.picker_bonus_offers 
        WHERE is_active = true 
          AND v_completion_date BETWEEN start_date AND end_date
    LOOP
        v_period_key := v_offer.start_date::TEXT || '_' || v_offer.end_date::TEXT;

        -- Count completed slots for this offer period
        SELECT COUNT(id) INTO v_completed_slots
        FROM public.staff_shifts
        WHERE staff_id = p_staff_id
          AND status = 'completed'
          AND work_slot_id IS NOT NULL
          AND (completed_at AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN v_offer.start_date AND v_offer.end_date;

        -- Find the highest achieved milestone
        SELECT * INTO v_milestone
        FROM public.picker_bonus_offer_milestones
        WHERE offer_id = v_offer.id
          AND target_value <= v_completed_slots
        ORDER BY target_value DESC
        LIMIT 1;

        IF FOUND THEN
            -- Check if we already awarded this milestone
            IF NOT EXISTS (
                SELECT 1 FROM public.picker_bonus_awards 
                WHERE staff_id = p_staff_id 
                  AND offer_id = v_offer.id 
                  AND period_key = v_period_key 
                  AND milestone_id = v_milestone.id
            ) THEN
                -- Calculate sum of all previously awarded increments for this offer period
                SELECT COALESCE(SUM(incremental_award_amount), 0) INTO v_already_awarded
                FROM public.picker_bonus_awards
                WHERE staff_id = p_staff_id
                  AND offer_id = v_offer.id
                  AND period_key = v_period_key;

                v_award_delta := v_milestone.reward_amount - v_already_awarded;

                IF v_award_delta > 0 THEN
                    INSERT INTO public.picker_bonus_awards (
                        staff_id,
                        offer_id,
                        period_key,
                        milestone_id,
                        offer_name_snapshot,
                        milestone_target,
                        configured_total_reward,
                        incremental_award_amount,
                        awarded_at,
                        earning_date
                    ) VALUES (
                        p_staff_id,
                        v_offer.id,
                        v_period_key,
                        v_milestone.id,
                        v_offer.name,
                        v_milestone.target_value,
                        v_milestone.reward_amount,
                        v_award_delta,
                        now(),
                        v_completion_date
                    ) ON CONFLICT (staff_id, offer_id, period_key, milestone_id) DO NOTHING;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.evaluate_picker_bonus_offers(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_picker_bonus_offers(UUID, TIMESTAMPTZ) FROM authenticated;

-- 7. Update reconcile_worker_shifts to authoritatively set completed_at and evaluate bonuses
CREATE OR REPLACE FUNCTION public.reconcile_worker_shifts(p_staff_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_shift RECORD;
    v_next_shift RECORD;
    v_changes_made BOOLEAN;
    v_staff_role public.user_role;
    v_effective_start TIMESTAMPTZ;
    v_effective_end TIMESTAMPTZ;
    v_active_minutes INT;
BEGIN
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = p_staff_id;

    LOOP
        v_changes_made := false;

        FOR v_active_shift IN 
            SELECT * FROM public.staff_shifts 
            WHERE staff_id = p_staff_id AND status = 'active' AND now() >= shift_end
            FOR UPDATE
        LOOP
            -- Close the active shift authoritatively
            UPDATE public.staff_shifts 
            SET status = 'completed', 
                updated_at = NOW(),
                completed_at = COALESCE(completed_at, NOW()) -- Set exact completion time
            WHERE id = v_active_shift.id
            RETURNING * INTO v_active_shift;
            
            v_changes_made := true;

            -- Trigger Bonus Evaluator for Pickers
            IF v_staff_role = 'picker'::public.user_role THEN
                PERFORM public.evaluate_picker_bonus_offers(p_staff_id, v_active_shift.completed_at);
            END IF;

            -- Generate Payout if valid picker rate exists
            IF v_staff_role = 'picker'::public.user_role AND v_active_shift.picker_rate_snapshot IS NOT NULL AND v_active_shift.picker_rate_snapshot > 0 THEN
                v_effective_end := LEAST(now(), v_active_shift.shift_end);
                v_effective_start := COALESCE(v_active_shift.started_at, v_active_shift.shift_start);
                v_active_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_effective_end - v_effective_start)) / 60));

                INSERT INTO public.staff_shift_payouts (
                    staff_id, shift_id, work_slot_id, warehouse_id, role,
                    items_count, active_minutes, shift_started_at, shift_ended_at, earning_date,
                    base_amount, incentive_amount, total_amount, status
                ) VALUES (
                    p_staff_id,
                    v_active_shift.id,
                    v_active_shift.work_slot_id,
                    v_active_shift.warehouse_id,
                    v_staff_role,
                    COALESCE(v_active_shift.items_picked, 0),
                    v_active_minutes,
                    v_effective_start,
                    v_effective_end,
                    (v_effective_start AT TIME ZONE 'Asia/Kolkata')::DATE,
                    0, 0, 0, 'earned'
                ) ON CONFLICT (shift_id) DO NOTHING;
                
                -- Update amounts
                UPDATE public.staff_shift_payouts sp
                SET base_amount = (s.items_picked * s.picker_rate_snapshot),
                    incentive_amount = COALESCE((
                        SELECT SUM(reward_amount)
                        FROM public.picker_shift_incentive_milestones m
                        WHERE m.shift_id = s.id AND m.target_items <= s.items_picked
                    ), 0)
                FROM public.staff_shifts s
                WHERE sp.shift_id = v_active_shift.id AND s.id = v_active_shift.id;
                
                UPDATE public.staff_shift_payouts
                SET total_amount = base_amount + incentive_amount
                WHERE shift_id = v_active_shift.id;
            END IF;
        END LOOP;

        EXIT WHEN NOT v_changes_made;
    END LOOP;

    -- Look for a valid pending scheduled shift to activate
    SELECT * INTO v_next_shift
    FROM public.staff_shifts
    WHERE staff_id = p_staff_id 
      AND status = 'scheduled'
      AND now() >= shift_start 
      AND now() < shift_end
    ORDER BY shift_start ASC
    LIMIT 1;

    IF v_next_shift IS NOT NULL THEN
        UPDATE public.staff_shifts 
        SET status = 'active', started_at = COALESCE(started_at, now()), updated_at = NOW()
        WHERE id = v_next_shift.id;
    END IF;
END;
$$;
