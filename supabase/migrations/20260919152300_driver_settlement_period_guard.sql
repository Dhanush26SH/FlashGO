-- Migration: 20260919152300_driver_settlement_period_guard.sql

-- Patch create_driver_settlement_batch to enforce period-close protection
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
    v_net_before_carry NUMERIC(10,2);
    v_previous_remaining NUMERIC(10,2);
    v_carried_deficit NUMERIC(10,2);
    v_deficit_recovered NUMERIC(10,2);
    v_remaining_deficit NUMERIC(10,2);
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
    -- Enforce period close: Do not allow generation if the period is still active
    IF now() < v_week_end_tz THEN
        RAISE EXCEPTION 'Cannot generate settlement: The accounting period is still active. Generation will be available on %', v_week_end_tz;
    END IF;


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
            
            -- Enforce strict chronological continuity
            IF EXISTS (
                SELECT 1 FROM public.driver_financial_ledger dfl
                WHERE dfl.driver_id = v_driver_id
                  AND dfl.occurred_at < v_week_start_tz
                  AND NOT EXISTS (
                      SELECT 1 FROM public.driver_settlement_items dsi
                      WHERE dsi.ledger_id = dfl.id
                  )
            ) THEN
                RAISE EXCEPTION 'Chronological error: Driver % has unsettled ledger activity in a previous week. Older settlements must be generated first.', v_driver_id;
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
                  AND NOT EXISTS (
                      SELECT 1 FROM public.driver_settlement_items dsi
                      WHERE dsi.ledger_id = public.driver_financial_ledger.id
                  )
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

                -- 1. Get previous remaining_deficit
                SELECT remaining_deficit INTO v_previous_remaining
                FROM public.driver_settlements
                WHERE driver_id = v_driver_id 
                  AND week_start < p_week_start
                ORDER BY week_start DESC 
                LIMIT 1;

                IF v_previous_remaining IS NULL THEN
                    v_previous_remaining := 0;
                END IF;

                -- 2. Net before carry
                v_carried_deficit := v_previous_remaining;
                v_net_before_carry := v_gross - v_ded + v_adj;

                -- 3. Recovery logic
                IF v_net_before_carry > 0 THEN
                    v_deficit_recovered := LEAST(v_carried_deficit, v_net_before_carry);
                    v_net := v_net_before_carry - v_deficit_recovered;
                    v_remaining_deficit := v_carried_deficit - v_deficit_recovered;
                ELSE
                    v_deficit_recovered := 0;
                    v_net := v_net_before_carry;
                    v_remaining_deficit := v_carried_deficit + ABS(v_net_before_carry);
                END IF;

                UPDATE public.driver_settlements 
                SET delivery_earnings = v_delivery, customer_tips = v_tips, incentives = v_inc,
                    gross_amount = v_gross, penalties = v_pen, deductions = v_ded,
                    adjustments = v_adj, net_amount = v_net,
                    carried_deficit = v_carried_deficit,
                    deficit_recovered = v_deficit_recovered,
                    remaining_deficit = v_remaining_deficit
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
