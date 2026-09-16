-- Migration: 20260916150500_staff_settlements_and_fixes.sql

-- ==========================================
-- 1. DRIVER SETTLEMENTS ARCHITECTURE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.driver_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial_success', 'failed')),
    requested_staff_count INT NOT NULL DEFAULT 0,
    successful_staff_count INT NOT NULL DEFAULT 0,
    failed_staff_count INT NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_settlement_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read batches" ON public.driver_settlement_batches FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

CREATE TABLE IF NOT EXISTS public.driver_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NULL REFERENCES public.driver_settlement_batches(id) ON DELETE SET NULL,
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    week_start DATE NOT NULL,
    
    -- Explicit Arithmetic Components
    delivery_earnings NUMERIC(10,2) NOT NULL DEFAULT 0,
    customer_tips NUMERIC(10,2) NOT NULL DEFAULT 0,
    incentives NUMERIC(10,2) NOT NULL DEFAULT 0,
    gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    penalties NUMERIC(10,2) NOT NULL DEFAULT 0,
    deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    adjustments NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'paid')),
    payment_provider TEXT NULL,
    payment_method TEXT NULL,
    payment_reference TEXT NULL,
    provider_payment_id TEXT NULL,
    provider_reference TEXT NULL,
    idempotency_key TEXT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ NULL,
    actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (driver_id, warehouse_id, week_start)
);
ALTER TABLE public.driver_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settlements" ON public.driver_settlements FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));
CREATE POLICY "Drivers read own settlements" ON public.driver_settlements FOR SELECT TO authenticated USING (auth.uid() = driver_id);

CREATE UNIQUE INDEX idx_unique_driver_payment_ref ON public.driver_settlements (payment_provider, payment_reference) WHERE payment_reference IS NOT NULL AND payment_provider IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.driver_settlement_items (
    settlement_id UUID NOT NULL REFERENCES public.driver_settlements(id) ON DELETE CASCADE,
    ledger_id UUID NOT NULL UNIQUE REFERENCES public.driver_financial_ledger(id) ON DELETE RESTRICT,
    amount_snapshot NUMERIC(10,2) NOT NULL,
    transaction_type TEXT NOT NULL,
    PRIMARY KEY (settlement_id, ledger_id)
);
ALTER TABLE public.driver_settlement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settlement items" ON public.driver_settlement_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

-- ==========================================
-- 2. CREATE DRIVER SETTLEMENT BATCH RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.create_driver_settlement_batch(
    p_warehouse_id UUID,
    p_week_start DATE,
    p_staff_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_batch_id UUID;
    v_driver_id UUID;
    v_settlement_id UUID;
    v_ledger RECORD;
    v_week_end_tz TIMESTAMPTZ;
    v_week_start_tz TIMESTAMPTZ;
    v_requested_count INT := 0;
    v_processed_count INT := 0;
    v_failed_count INT := 0;
    v_batch_status TEXT;
    
    v_delivery NUMERIC(10,2);
    v_tips NUMERIC(10,2);
    v_inc NUMERIC(10,2);
    v_gross NUMERIC(10,2);
    v_pen NUMERIC(10,2);
    v_ded NUMERIC(10,2);
    v_adj NUMERIC(10,2);
    v_net NUMERIC(10,2);
    v_ledger_count INT;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can process settlement batches';
    END IF;

    IF EXTRACT(ISODOW FROM p_week_start) != 1 THEN
        RAISE EXCEPTION 'week_start must be a Monday';
    END IF;

    v_week_start_tz := (p_week_start || ' 00:00:00+05:30')::TIMESTAMPTZ;
    v_week_end_tz := v_week_start_tz + INTERVAL '7 days';

    v_requested_count := array_length(p_staff_ids, 1);
    IF v_requested_count IS NULL THEN v_requested_count := 0; END IF;

    INSERT INTO public.driver_settlement_batches (warehouse_id, week_start, requested_staff_count, created_by)
    VALUES (p_warehouse_id, p_week_start, v_requested_count, auth.uid())
    RETURNING id INTO v_batch_id;

    FOREACH v_driver_id IN ARRAY p_staff_ids LOOP
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = v_driver_id AND role = 'driver' AND warehouse_id = p_warehouse_id
            ) THEN
                RAISE EXCEPTION 'Staff % is not a valid driver at warehouse %', v_driver_id, p_warehouse_id;
            END IF;
            
            IF EXISTS (SELECT 1 FROM public.driver_settlements WHERE driver_id = v_driver_id AND warehouse_id = p_warehouse_id AND week_start = p_week_start) THEN
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;

            v_delivery := 0; v_tips := 0; v_inc := 0; v_gross := 0; v_pen := 0; v_ded := 0; v_adj := 0; v_net := 0; v_ledger_count := 0;

            INSERT INTO public.driver_settlements (
                batch_id, driver_id, warehouse_id, week_start, created_by
            ) VALUES (
                v_batch_id, v_driver_id, p_warehouse_id, p_week_start, auth.uid()
            ) RETURNING id INTO v_settlement_id;

            FOR v_ledger IN
                SELECT id, amount, transaction_type 
                FROM public.driver_financial_ledger
                WHERE driver_id = v_driver_id
                  AND transaction_type IN ('delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment')
                  AND occurred_at >= v_week_start_tz
                  AND occurred_at < v_week_end_tz
                  AND id NOT IN (SELECT ledger_id FROM public.driver_settlement_items)
                FOR UPDATE
            LOOP
                INSERT INTO public.driver_settlement_items (settlement_id, ledger_id, amount_snapshot, transaction_type)
                VALUES (v_settlement_id, v_ledger.id, v_ledger.amount, v_ledger.transaction_type);

                v_ledger_count := v_ledger_count + 1;

                IF v_ledger.transaction_type = 'delivery_earning' THEN v_delivery := v_delivery + v_ledger.amount;
                ELSIF v_ledger.transaction_type = 'customer_tip' THEN v_tips := v_tips + v_ledger.amount;
                ELSIF v_ledger.transaction_type = 'incentive' THEN v_inc := v_inc + v_ledger.amount;
                ELSIF v_ledger.transaction_type = 'penalty' THEN v_pen := v_pen + abs(v_ledger.amount);
                ELSIF v_ledger.transaction_type = 'adjustment' THEN v_adj := v_adj + v_ledger.amount;
                END IF;
            END LOOP;

            IF v_ledger_count > 0 THEN
                v_gross := v_delivery + v_tips + v_inc;
                v_ded := v_pen;
                v_net := v_gross - v_ded + v_adj;

                UPDATE public.driver_settlements 
                SET delivery_earnings = v_delivery, customer_tips = v_tips, incentives = v_inc,
                    gross_amount = v_gross, penalties = v_pen, deductions = v_ded,
                    adjustments = v_adj, net_amount = v_net
                WHERE id = v_settlement_id;
                
                v_processed_count := v_processed_count + 1;
            ELSE
                RAISE EXCEPTION 'NO_LEDGER_ITEMS';
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    IF v_processed_count = 0 THEN v_batch_status := 'failed';
    ELSIF v_failed_count > 0 THEN v_batch_status := 'partial_success';
    ELSE v_batch_status := 'completed'; END IF;

    UPDATE public.driver_settlement_batches
    SET status = v_batch_status, successful_staff_count = v_processed_count, failed_staff_count = v_failed_count
    WHERE id = v_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'processed_count', v_processed_count, 'failed_count', v_failed_count);
END;
$$;
REVOKE ALL ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver_settlement_batch(UUID, DATE, UUID[]) TO authenticated;


-- ==========================================
-- 3. REVISE PICKER SETTLEMENT ARCHITECTURE
-- ==========================================

-- Alter table safely: Use NULL defaults to preserve historical unknown states
ALTER TABLE public.picker_settlements 
ADD COLUMN IF NOT EXISTS shift_earnings NUMERIC(10,2) NULL,
ADD COLUMN IF NOT EXISTS bonus_earnings NUMERIC(10,2) NULL,
ADD COLUMN IF NOT EXISTS deductions NUMERIC(10,2) NULL,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2) NULL;

-- Safely backfill historical net_amount = total_amount. Leave shift/bonus NULL to prevent fabricating data.
UPDATE public.picker_settlements SET net_amount = total_amount WHERE net_amount IS NULL;

-- Create bonus items mapping table
CREATE TABLE IF NOT EXISTS public.picker_settlement_bonus_items (
    settlement_id UUID NOT NULL REFERENCES public.picker_settlements(id) ON DELETE CASCADE,
    picker_bonus_award_id UUID NOT NULL UNIQUE REFERENCES public.picker_bonus_awards(id) ON DELETE RESTRICT,
    amount_snapshot NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (settlement_id, picker_bonus_award_id)
);
ALTER TABLE public.picker_settlement_bonus_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read bonus items" ON public.picker_settlement_bonus_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager')));

-- Update RPC to support bonuses and Wednesday
CREATE OR REPLACE FUNCTION public.create_picker_settlement_batch(
    p_warehouse_id UUID,
    p_week_start DATE,
    p_staff_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_batch_id UUID;
    v_staff_id UUID;
    v_settlement_id UUID;
    
    v_payout RECORD;
    v_bonus RECORD;
    
    v_shift_earnings NUMERIC(10,2);
    v_bonus_earnings NUMERIC(10,2);
    v_deductions NUMERIC(10,2);
    v_net_amount NUMERIC(10,2);
    
    v_item_count INT;
    
    v_week_end_tz TIMESTAMPTZ;
    v_week_start_tz TIMESTAMPTZ;
    v_requested_count INT := 0;
    v_processed_count INT := 0;
    v_failed_count INT := 0;
    v_batch_status TEXT;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can process settlement batches';
    END IF;

    -- ONLY allow Wednesday now.
    -- (This has NO impact on existing Monday settlements since those are already saved and this RPC is only for new creation)
    IF EXTRACT(ISODOW FROM p_week_start) != 3 THEN
        RAISE EXCEPTION 'week_start must be a Wednesday';
    END IF;

    -- Boundaries [Wednesday 00:00, next Wednesday 00:00) in Asia/Kolkata
    v_week_start_tz := (p_week_start || ' 00:00:00+05:30')::TIMESTAMPTZ;
    v_week_end_tz := v_week_start_tz + INTERVAL '7 days';

    v_requested_count := array_length(p_staff_ids, 1);
    IF v_requested_count IS NULL THEN v_requested_count := 0; END IF;

    INSERT INTO public.picker_settlement_batches (warehouse_id, week_start, requested_staff_count, created_by)
    VALUES (p_warehouse_id, p_week_start, v_requested_count, auth.uid())
    RETURNING id INTO v_batch_id;

    FOREACH v_staff_id IN ARRAY p_staff_ids LOOP
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = v_staff_id AND role = 'picker' AND warehouse_id = p_warehouse_id
            ) THEN
                RAISE EXCEPTION 'Staff % is not a valid picker at warehouse %', v_staff_id, p_warehouse_id;
            END IF;
            
            IF EXISTS (SELECT 1 FROM public.picker_settlements WHERE staff_id = v_staff_id AND warehouse_id = p_warehouse_id AND week_start = p_week_start) THEN
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;

            v_shift_earnings := 0; v_bonus_earnings := 0; v_deductions := 0; v_net_amount := 0; v_item_count := 0;

            INSERT INTO public.picker_settlements (
                batch_id, staff_id, warehouse_id, week_start, total_amount, status, created_by
            ) VALUES (
                v_batch_id, v_staff_id, p_warehouse_id, p_week_start, 0, 'ready', auth.uid()
            ) RETURNING id INTO v_settlement_id;

            -- 1. Snapshot Shift Payouts
            FOR v_payout IN
                SELECT id, total_amount FROM public.staff_shift_payouts
                WHERE staff_id = v_staff_id
                  AND warehouse_id = p_warehouse_id
                  AND earning_date >= (v_week_start_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  AND earning_date < (v_week_end_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  AND id NOT IN (SELECT staff_shift_payout_id FROM public.picker_settlement_items)
                FOR UPDATE
            LOOP
                INSERT INTO public.picker_settlement_items (settlement_id, staff_shift_payout_id, amount_snapshot)
                VALUES (v_settlement_id, v_payout.id, v_payout.total_amount);

                v_shift_earnings := v_shift_earnings + v_payout.total_amount;
                v_item_count := v_item_count + 1;
            END LOOP;

            -- 2. Snapshot Bonus Awards
            FOR v_bonus IN
                SELECT id, incremental_award_amount FROM public.picker_bonus_awards
                WHERE staff_id = v_staff_id
                  AND earning_date >= (v_week_start_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  AND earning_date < (v_week_end_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  AND id NOT IN (SELECT picker_bonus_award_id FROM public.picker_settlement_bonus_items)
                FOR UPDATE
            LOOP
                INSERT INTO public.picker_settlement_bonus_items (settlement_id, picker_bonus_award_id, amount_snapshot)
                VALUES (v_settlement_id, v_bonus.id, v_bonus.incremental_award_amount);
                
                v_bonus_earnings := v_bonus_earnings + v_bonus.incremental_award_amount;
                v_item_count := v_item_count + 1;
            END LOOP;

            IF v_item_count > 0 THEN
                v_net_amount := v_shift_earnings + v_bonus_earnings - v_deductions;
                
                UPDATE public.picker_settlements 
                SET shift_earnings = v_shift_earnings,
                    bonus_earnings = v_bonus_earnings,
                    deductions = v_deductions,
                    net_amount = v_net_amount,
                    total_amount = v_net_amount -- Maintaining for backward compatibility
                WHERE id = v_settlement_id;
                
                v_processed_count := v_processed_count + 1;
            ELSE
                RAISE EXCEPTION 'NO_PAYOUTS_OR_BONUSES';
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    IF v_processed_count = 0 THEN v_batch_status := 'failed';
    ELSIF v_failed_count > 0 THEN v_batch_status := 'partial_success';
    ELSE v_batch_status := 'completed'; END IF;

    UPDATE public.picker_settlement_batches
    SET status = v_batch_status, successful_staff_count = v_processed_count, failed_staff_count = v_failed_count
    WHERE id = v_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'processed_count', v_processed_count, 'failed_count', v_failed_count);
END;
$$;
REVOKE ALL ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) TO authenticated;
