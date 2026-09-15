-- Migration: 20260916000144_picker_weekly_settlements.sql

CREATE TABLE IF NOT EXISTS public.picker_settlement_batches (
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
ALTER TABLE public.picker_settlement_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read batches" ON public.picker_settlement_batches FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);

CREATE TABLE IF NOT EXISTS public.picker_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NULL REFERENCES public.picker_settlement_batches(id) ON DELETE SET NULL,
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    week_start DATE NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
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
    UNIQUE (staff_id, warehouse_id, week_start)
);
ALTER TABLE public.picker_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settlements" ON public.picker_settlements FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);
CREATE POLICY "Pickers read own settlements" ON public.picker_settlements FOR SELECT TO authenticated USING (
    auth.uid() = staff_id
);

-- Payment Reference Uniqueness
CREATE UNIQUE INDEX idx_unique_picker_payment_ref ON public.picker_settlements (payment_provider, payment_reference) WHERE payment_reference IS NOT NULL AND payment_provider IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.picker_settlement_items (
    settlement_id UUID NOT NULL REFERENCES public.picker_settlements(id) ON DELETE CASCADE,
    staff_shift_payout_id UUID NOT NULL UNIQUE REFERENCES public.staff_shift_payouts(id) ON DELETE RESTRICT,
    amount_snapshot NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (settlement_id, staff_shift_payout_id)
);
ALTER TABLE public.picker_settlement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settlement items" ON public.picker_settlement_items FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);

-- Helper to safely compute and lock week period
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
    v_total NUMERIC(10,2);
    v_payout RECORD;
    v_week_end_tz TIMESTAMPTZ;
    v_week_start_tz TIMESTAMPTZ;
    v_requested_count INT := 0;
    v_processed_count INT := 0;
    v_failed_count INT := 0;
    v_batch_status TEXT;
BEGIN
    -- Only admin can run this
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can process settlement batches';
    END IF;

    -- Validate week_start is a Monday
    IF EXTRACT(ISODOW FROM p_week_start) != 1 THEN
        RAISE EXCEPTION 'week_start must be a Monday';
    END IF;

    -- Determine half-open interval boundaries [Monday 00:00, next_week_start Monday 00:00)
    -- Assume Asia/Kolkata timezone mapping for proper boundaries
    v_week_start_tz := (p_week_start || ' 00:00:00+05:30')::TIMESTAMPTZ;
    v_week_end_tz := v_week_start_tz + INTERVAL '7 days';

    v_requested_count := array_length(p_staff_ids, 1);
    IF v_requested_count IS NULL THEN v_requested_count := 0; END IF;

    -- Create batch
    INSERT INTO public.picker_settlement_batches (warehouse_id, week_start, requested_staff_count, created_by)
    VALUES (p_warehouse_id, p_week_start, v_requested_count, auth.uid())
    RETURNING id INTO v_batch_id;

    -- Loop over provided staff
    FOREACH v_staff_id IN ARRAY p_staff_ids LOOP
        BEGIN
            -- Validate staff is genuine picker at this warehouse
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = v_staff_id AND role = 'picker' AND warehouse_id = p_warehouse_id
            ) THEN
                RAISE EXCEPTION 'Staff % is not a valid picker at warehouse %', v_staff_id, p_warehouse_id;
            END IF;
            
            -- Prevent duplicate settlement for this week explicitly via UNIQUE constraint handling
            IF EXISTS (SELECT 1 FROM public.picker_settlements WHERE staff_id = v_staff_id AND warehouse_id = p_warehouse_id AND week_start = p_week_start) THEN
                -- Already settled, skip
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;

            v_total := 0;

            -- Create the settlement row first (so we can link items)
            INSERT INTO public.picker_settlements (
                batch_id, staff_id, warehouse_id, week_start, total_amount, status, created_by
            ) VALUES (
                v_batch_id, v_staff_id, p_warehouse_id, p_week_start, 0, 'ready', auth.uid()
            ) RETURNING id INTO v_settlement_id;

            -- Find eligible payouts
            -- Earning timestamp >= week_start AND earning timestamp < next_week_start
            FOR v_payout IN
                SELECT id, total_amount FROM public.staff_shift_payouts
                WHERE staff_id = v_staff_id
                  AND warehouse_id = p_warehouse_id
                  AND earning_date >= (v_week_start_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  AND earning_date < (v_week_end_tz AT TIME ZONE 'Asia/Kolkata')::DATE
                  -- Not already linked
                  AND id NOT IN (SELECT staff_shift_payout_id FROM public.picker_settlement_items)
                FOR UPDATE
            LOOP
                -- Snapshot and link
                INSERT INTO public.picker_settlement_items (settlement_id, staff_shift_payout_id, amount_snapshot)
                VALUES (v_settlement_id, v_payout.id, v_payout.total_amount);

                v_total := v_total + v_payout.total_amount;
            END LOOP;

            IF v_total > 0 THEN
                -- Update final total
                UPDATE public.picker_settlements SET total_amount = v_total WHERE id = v_settlement_id;
                v_processed_count := v_processed_count + 1;
            ELSE
                -- Rollback this specific settlement if there are no payouts
                -- This raises an exception that we catch, rolling back JUST this block
                RAISE EXCEPTION 'NO_PAYOUTS';
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                -- Subtransaction rollback for this specific picker
                -- Does not fail the entire batch
                v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    -- Finalize batch status
    IF v_processed_count = 0 THEN
        v_batch_status := 'failed';
    ELSIF v_failed_count > 0 THEN
        v_batch_status := 'partial_success';
    ELSE
        v_batch_status := 'completed';
    END IF;

    UPDATE public.picker_settlement_batches
    SET status = v_batch_status,
        successful_staff_count = v_processed_count,
        failed_staff_count = v_failed_count
    WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'success', true, 
        'batch_id', v_batch_id,
        'processed_count', v_processed_count,
        'failed_count', v_failed_count
    );
END;
$$;
REVOKE ALL ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_picker_settlement_batch(UUID, DATE, UUID[]) TO authenticated;

-- Mark Picker Settlement Paid
CREATE OR REPLACE FUNCTION public.mark_picker_settlement_paid(
    p_settlement_id UUID,
    p_payment_reference TEXT,
    p_payment_method TEXT,
    p_payment_provider TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_settlement RECORD;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can mark payments as paid';
    END IF;

    IF trim(p_payment_reference) = '' THEN
        RAISE EXCEPTION 'Payment reference is required';
    END IF;

    -- Lock settlement
    SELECT * INTO v_settlement FROM public.picker_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found';
    END IF;

    IF v_settlement.status = 'paid' THEN
        RAISE EXCEPTION 'Settlement is already paid';
    END IF;

    UPDATE public.picker_settlements
    SET status = 'paid',
        payment_reference = trim(p_payment_reference),
        payment_method = p_payment_method,
        payment_provider = p_payment_provider,
        paid_at = now(),
        actor_id = auth.uid()
    WHERE id = p_settlement_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_picker_settlement_paid(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_picker_settlement_paid(UUID, TEXT, TEXT, TEXT) TO authenticated;
