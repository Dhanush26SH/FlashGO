-- Migration: 20260916000117_staff_shift_payouts.sql

-- 1. Create staff_shift_payouts table
CREATE TABLE IF NOT EXISTS public.staff_shift_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL UNIQUE REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
    work_slot_id UUID REFERENCES public.work_slots(id) ON DELETE SET NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    role public.user_role NOT NULL DEFAULT 'picker'::public.user_role,
    
    base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    incentive_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    items_count INT NOT NULL DEFAULT 0,
    active_minutes INT NOT NULL DEFAULT 0,
    complaints_count INT NOT NULL DEFAULT 0,
    
    shift_started_at TIMESTAMPTZ NOT NULL,
    shift_ended_at TIMESTAMPTZ NOT NULL,
    earning_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'earned',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT base_amount_non_negative CHECK (base_amount >= 0),
    CONSTRAINT incentive_amount_non_negative CHECK (incentive_amount >= 0),
    CONSTRAINT total_amount_valid CHECK (total_amount >= 0 AND total_amount = base_amount + incentive_amount),
    CONSTRAINT items_count_non_negative CHECK (items_count >= 0),
    CONSTRAINT active_minutes_non_negative CHECK (active_minutes >= 0),
    CONSTRAINT complaints_count_non_negative CHECK (complaints_count >= 0),
    CONSTRAINT valid_status CHECK (status IN ('earned'))
);

-- 2. Enable RLS
ALTER TABLE public.staff_shift_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Picker view own payouts" ON public.staff_shift_payouts FOR SELECT
USING (auth.uid() = staff_id);

CREATE POLICY "Admin view all payouts" ON public.staff_shift_payouts FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::public.user_role)
);

CREATE POLICY "Warehouse Manager view all payouts" ON public.staff_shift_payouts FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'warehouse_manager'::public.user_role)
);

-- 3. Create Internal Earnings Helper (NO AUTH CHECKS, STRICT EXECUTE)
CREATE OR REPLACE FUNCTION public.calculate_picker_shift_earnings_internal(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift RECORD;
    v_base_earnings NUMERIC(10,2) := 0;
    v_incentive_earned NUMERIC(10,2) := 0;
    v_total NUMERIC(10,2) := 0;
BEGIN
    SELECT * INTO v_shift
    FROM public.staff_shifts
    WHERE id = p_shift_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found');
    END IF;

    -- Base
    IF v_shift.picker_rate_snapshot IS NOT NULL AND v_shift.picker_rate_snapshot > 0 THEN
        v_base_earnings := v_shift.items_picked * v_shift.picker_rate_snapshot;
    END IF;
    
    -- Cumulative Incentive
    SELECT COALESCE(SUM(reward_amount), 0) INTO v_incentive_earned
    FROM public.picker_shift_incentive_milestones
    WHERE shift_id = p_shift_id
      AND target_items <= v_shift.items_picked;

    v_total := v_base_earnings + v_incentive_earned;

    RETURN jsonb_build_object(
        'success', true,
        'items_picked', v_shift.items_picked,
        'rate_per_item', COALESCE(v_shift.picker_rate_snapshot, 0),
        'base_earnings', v_base_earnings,
        'achieved_incentive_reward', v_incentive_earned,
        'total_earnings', v_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_picker_shift_earnings_internal(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_picker_shift_earnings_internal(UUID) FROM authenticated;

-- 4. Update Public Wrapper
CREATE OR REPLACE FUNCTION public.calculate_picker_shift_earnings(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.user_role;
    v_uid  UUID := auth.uid();
    v_is_authorized BOOLEAN := false;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    -- Authorization logic
    IF v_role = 'admin'::public.user_role THEN
        v_is_authorized := true;
    ELSIF v_role = 'warehouse_manager'::public.user_role THEN
        v_is_authorized := true;
    ELSIF v_role = 'picker'::public.user_role THEN
        IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE id = p_shift_id AND staff_id = v_uid) THEN
            v_is_authorized := true;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    RETURN public.calculate_picker_shift_earnings_internal(p_shift_id);
END;
$$;

-- 5. Inject Payout Logic into reconcile_worker_shifts
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
    v_earning_date DATE;
    v_earnings JSONB;
    v_base_amount NUMERIC(10,2);
    v_incentive_amount NUMERIC(10,2);
    v_total_amount NUMERIC(10,2);
BEGIN
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = p_staff_id;

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
                UPDATE public.staff_shifts SET status = 'completed' WHERE id = v_active_shift.id;
                UPDATE public.staff_shifts SET status = 'active' WHERE id = v_next_shift.id;
                v_changes_made := true;
            ELSE
                -- No consecutive shift. Check if +5 minutes have expired.
                IF now() >= v_active_shift.shift_end + interval '5 minutes' THEN
                    UPDATE public.staff_shifts SET status = 'completed' WHERE id = v_active_shift.id;
                    v_changes_made := true;
                END IF;
            END IF;

            IF v_changes_made AND v_staff_role = 'picker'::public.user_role AND v_active_shift.picker_rate_snapshot > 0 THEN
                v_effective_end := LEAST(now(), v_active_shift.shift_end);
                v_effective_start := COALESCE(v_active_shift.started_at, v_active_shift.shift_start);
                v_active_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_effective_end - v_effective_start)) / 60));
                v_earning_date := (v_effective_start AT TIME ZONE 'Asia/Kolkata')::DATE;

                v_earnings := public.calculate_picker_shift_earnings_internal(v_active_shift.id);

                IF (v_earnings->>'success')::BOOLEAN THEN
                    v_base_amount := COALESCE((v_earnings->>'base_earnings')::NUMERIC, 0);
                    v_incentive_amount := COALESCE((v_earnings->>'achieved_incentive_reward')::NUMERIC, 0);
                    v_total_amount := COALESCE((v_earnings->>'total_earnings')::NUMERIC, 0);

                    INSERT INTO public.staff_shift_payouts (
                        staff_id,
                        shift_id,
                        work_slot_id,
                        warehouse_id,
                        role,
                        base_amount,
                        incentive_amount,
                        total_amount,
                        items_count,
                        active_minutes,
                        complaints_count,
                        shift_started_at,
                        shift_ended_at,
                        earning_date,
                        status
                    ) VALUES (
                        p_staff_id,
                        v_active_shift.id,
                        v_active_shift.work_slot_id,
                        v_active_shift.warehouse_id,
                        'picker'::public.user_role,
                        v_base_amount,
                        v_incentive_amount,
                        v_total_amount,
                        COALESCE(v_active_shift.items_picked, 0),
                        v_active_minutes,
                        COALESCE(v_active_shift.complaints, 0),
                        v_effective_start,
                        v_effective_end,
                        v_earning_date,
                        'earned'
                    ) ON CONFLICT (shift_id) DO NOTHING;
                END IF;
            END IF;
        END LOOP;

        EXIT WHEN NOT v_changes_made;
    END LOOP;
END;
$$;
