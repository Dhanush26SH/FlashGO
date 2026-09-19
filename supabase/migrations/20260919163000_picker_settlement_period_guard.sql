-- Migration: 20260919163000_picker_settlement_period_guard.sql

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

    -- Validate week_start is a Wednesday
    IF EXTRACT(ISODOW FROM p_week_start) != 3 THEN
        RAISE EXCEPTION 'week_start must be a Wednesday';
    END IF;

    -- Determine half-open interval boundaries [Wednesday 00:00, next_week_start Wednesday 00:00)
    -- Assume Asia/Kolkata timezone mapping for proper boundaries
    v_week_start_tz := (p_week_start || ' 00:00:00+05:30')::TIMESTAMPTZ;
    v_week_end_tz := v_week_start_tz + INTERVAL '7 days';

    -- Authoritative backend period-close guard
    IF now() < v_week_end_tz THEN
        RAISE EXCEPTION 'Cannot generate settlements for an active or future period. Please wait until the period ends at %', v_week_end_tz;
    END IF;

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
