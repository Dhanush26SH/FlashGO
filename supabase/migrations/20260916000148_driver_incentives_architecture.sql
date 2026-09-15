-- Migration: 20260916000148_driver_incentives_architecture.sql
-- Description: Driver Daily Incentive Architecture (Warehouse + Business Date)

-- 1. Create the Driver Daily Incentive Campaign table
CREATE TABLE IF NOT EXISTS public.driver_daily_incentive_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(warehouse_id, business_date)
);

-- 2. Create the Driver Daily Incentive Milestones table
CREATE TABLE IF NOT EXISTS public.driver_daily_incentive_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.driver_daily_incentive_campaigns(id) ON DELETE CASCADE,
    target_earnings NUMERIC(10,2) NOT NULL CHECK (target_earnings > 0),
    reward_amount NUMERIC(10,2) NOT NULL CHECK (reward_amount > 0),
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(campaign_id, target_earnings),
    UNIQUE(campaign_id, sort_order)
);

-- Enable RLS
ALTER TABLE public.driver_daily_incentive_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_daily_incentive_milestones ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Admin/Super Admin can manage campaigns
CREATE POLICY "Admins can manage driver daily campaigns"
ON public.driver_daily_incentive_campaigns
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')
    )
);

CREATE POLICY "Users can view driver daily campaigns"
ON public.driver_daily_incentive_campaigns
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Admin/Super Admin can manage milestones
CREATE POLICY "Admins can manage driver daily milestones"
ON public.driver_daily_incentive_milestones
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')
    )
);

CREATE POLICY "Users can view driver daily milestones"
ON public.driver_daily_incentive_milestones
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 4. Admin Save RPC
CREATE OR REPLACE FUNCTION public.admin_save_driver_daily_incentive(
    p_warehouse_id UUID, 
    p_business_date DATE, 
    p_enabled BOOLEAN, 
    p_milestones JSONB
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    v_role TEXT;
    v_campaign_id UUID;
    v_milestone JSONB;
    v_count INT;
    v_prev_target NUMERIC := 0;
    v_target NUMERIC;
    v_reward NUMERIC;
BEGIN
    -- Validate admin
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Basic validation
    IF p_milestones IS NOT NULL THEN
        v_count := jsonb_array_length(p_milestones);
        IF v_count > 4 THEN
            RAISE EXCEPTION 'Maximum 4 milestones allowed per campaign.';
        END IF;

        -- Validate milestones strictly ascending
        FOR v_milestone IN SELECT * FROM jsonb_array_elements(p_milestones)
        LOOP
            v_target := (v_milestone->>'target_earnings')::NUMERIC;
            v_reward := (v_milestone->>'reward_amount')::NUMERIC;

            IF v_target <= 0 THEN
                RAISE EXCEPTION 'Target earnings must be > 0';
            END IF;
            IF v_reward <= 0 THEN
                RAISE EXCEPTION 'Reward amount must be > 0';
            END IF;
            
            IF v_target <= v_prev_target THEN
                RAISE EXCEPTION 'Targets must be strictly ascending (duplicate or out-of-order target detected)';
            END IF;
            
            v_prev_target := v_target;
        END LOOP;
    END IF;

    -- Upsert campaign
    INSERT INTO public.driver_daily_incentive_campaigns (warehouse_id, business_date, enabled)
    VALUES (p_warehouse_id, p_business_date, p_enabled)
    ON CONFLICT (warehouse_id, business_date)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
    RETURNING id INTO v_campaign_id;

    -- Replace milestones entirely
    DELETE FROM public.driver_daily_incentive_milestones WHERE campaign_id = v_campaign_id;
    
    IF p_milestones IS NOT NULL AND jsonb_array_length(p_milestones) > 0 THEN
        INSERT INTO public.driver_daily_incentive_milestones (campaign_id, target_earnings, reward_amount, sort_order)
        SELECT v_campaign_id, 
               (m->>'target_earnings')::NUMERIC, 
               (m->>'reward_amount')::NUMERIC, 
               (m->>'sort_order')::INT
        FROM jsonb_array_elements(p_milestones) AS m;
    END IF;
END;
$function$;

-- 5. Admin Get RPC
CREATE OR REPLACE FUNCTION public.admin_get_driver_daily_incentives(p_warehouse_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Ensure warehouse manager can only see their warehouse
    IF v_profile.warehouse_id IS NOT NULL AND v_profile.warehouse_id != p_warehouse_id THEN
        RETURN '[]'::JSONB;
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'warehouse_id', c.warehouse_id,
            'business_date', c.business_date,
            'enabled', c.enabled,
            'milestones', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'target_earnings', m.target_earnings,
                    'reward_amount', m.reward_amount,
                    'sort_order', m.sort_order
                ) ORDER BY m.sort_order)
                 FROM public.driver_daily_incentive_milestones m
                 WHERE m.campaign_id = c.id),
                '[]'::jsonb
            )
        ) ORDER BY c.business_date DESC
    ), '[]'::JSONB) INTO v_result
    FROM public.driver_daily_incentive_campaigns c
    WHERE c.warehouse_id = p_warehouse_id
      AND c.business_date >= p_start_date
      AND c.business_date <= p_end_date;

    RETURN v_result;
END;
$$;


-- 6. Driver Get Active Campaign RPC (using Asia/Kolkata business date)
CREATE OR REPLACE FUNCTION public.driver_get_active_campaign()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_profile RECORD;
    v_business_date DATE;
    v_campaign RECORD;
    v_result JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, warehouse_id INTO v_profile FROM public.profiles WHERE id = v_driver_id;
    IF v_profile.role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    IF v_profile.warehouse_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_WAREHOUSE_ASSIGNED');
    END IF;

    -- Calculate business date in Asia/Kolkata
    v_business_date := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;

    -- Fetch campaign for the driver's warehouse and current business date
    SELECT c.id, c.business_date, c.enabled
    INTO v_campaign
    FROM public.driver_daily_incentive_campaigns c
    WHERE c.warehouse_id = v_profile.warehouse_id
      AND c.business_date = v_business_date;

    IF v_campaign IS NULL OR v_campaign.enabled = false THEN
        RETURN jsonb_build_object('success', true, 'campaign', NULL);
    END IF;

    -- Return the campaign config. Since earnings tracking isn't implemented, progress = 0.
    SELECT jsonb_build_object(
        'success', true,
        'campaign', jsonb_build_object(
            'id', v_campaign.id,
            'business_date', v_campaign.business_date,
            'start_time', (v_campaign.business_date::timestamp AT TIME ZONE 'Asia/Kolkata'),
            'end_time', ((v_campaign.business_date + interval '1 day')::timestamp AT TIME ZONE 'Asia/Kolkata'),
            'milestones', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'target_earnings', inc.target_earnings,
                    'reward_amount', inc.reward_amount,
                    'sort_order', inc.sort_order
                ) ORDER BY inc.sort_order)
                 FROM public.driver_daily_incentive_milestones inc
                 WHERE inc.campaign_id = v_campaign.id),
                '[]'::jsonb
            )
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;
