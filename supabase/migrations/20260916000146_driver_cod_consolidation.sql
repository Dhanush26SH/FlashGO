-- Migration: 20260916000146_driver_cod_consolidation.sql
-- Implements ONE authoritative Driver COD settlement flow

-- 1. Create durable traceability tables for settlements
CREATE TABLE IF NOT EXISTS public.driver_cod_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ledger_entry_id UUID NOT NULL REFERENCES public.driver_financial_ledger(id) ON DELETE RESTRICT,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_reference TEXT UNIQUE NOT NULL,
    settled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    settled_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.driver_cod_settlement_items (
    settlement_id UUID NOT NULL REFERENCES public.driver_cod_settlements(id) ON DELETE CASCADE,
    cod_collection_id UUID NOT NULL REFERENCES public.cod_collections(id) ON DELETE RESTRICT UNIQUE,
    PRIMARY KEY (settlement_id, cod_collection_id)
);

-- RLS for settlement traceability
ALTER TABLE public.driver_cod_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_cod_settlement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage settlements" ON public.driver_cod_settlements FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin manage settlement items" ON public.driver_cod_settlement_items FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. Stop legacy liability increments in operational register_cod_delivery
CREATE OR REPLACE FUNCTION public.register_cod_delivery(
    p_order_id UUID,
    p_driver_id UUID,
    p_amount DECIMAL
) RETURNS BOOLEAN AS $$
BEGIN
    -- Insert pending COD collection. Ignore if already exists (idempotent)
    INSERT INTO public.cod_collections (order_id, driver_id, amount, status)
    VALUES (p_order_id, p_driver_id, p_amount, 'pending')
    ON CONFLICT (order_id) DO NOTHING;

    -- NOTE: We NO LONGER increment profiles.cod_wallet_liability here.
    -- The authoritative liability is maintained by driver_financial_ledger via the on_order_cod_collected trigger.

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Atomic Driver COD Settlement RPC
CREATE OR REPLACE FUNCTION public.admin_settle_driver_cod(
    p_driver_id UUID,
    p_order_ids UUID[],
    p_payment_reference TEXT
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_cod_collection RECORD;
    v_order RECORD;
    v_total_amount DECIMAL(12,2) := 0;
    v_current_unsettled DECIMAL(12,2) := 0;
    v_ledger_entry_id UUID;
    v_settlement_id UUID;
    v_driver_valid BOOLEAN;
    v_ledger_evidence_exists BOOLEAN;
    v_unique_orders UUID[];
BEGIN
    -- Validation: Admin role
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can settle Driver COD.';
    END IF;

    -- Validation: Genuine Driver
    SELECT TRUE INTO v_driver_valid FROM public.profiles WHERE id = p_driver_id AND role = 'driver';
    IF NOT v_driver_valid THEN
        RAISE EXCEPTION 'Invalid Driver: UUID does not exist or is not a driver.';
    END IF;

    -- Validation: Input basic
    IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No orders provided for settlement.';
    END IF;
    
    IF trim(p_payment_reference) = '' THEN
        RAISE EXCEPTION 'Payment reference cannot be empty.';
    END IF;

    -- Deduplicate input order array
    SELECT array_agg(DISTINCT o) INTO v_unique_orders FROM unnest(p_order_ids) as o;

    -- Validation loop (FOR UPDATE lock on cod_collections, ORDER BY to prevent deadlocks)
    FOR v_order_id IN SELECT unnest(v_unique_orders) ORDER BY 1
    LOOP
        SELECT id, order_id, driver_id, amount, status 
        INTO v_cod_collection 
        FROM public.cod_collections 
        WHERE order_id = v_order_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'COD Collection record not found for order %', v_order_id;
        END IF;

        IF v_cod_collection.status != 'pending' THEN
            RAISE EXCEPTION 'Order % is already %', v_order_id, v_cod_collection.status;
        END IF;

        IF v_cod_collection.driver_id != p_driver_id THEN
            RAISE EXCEPTION 'Order % belongs to a different driver', v_order_id;
        END IF;

        SELECT id, payment_method, status, cod_collected, driver_id, total_amount
        INTO v_order
        FROM public.orders
        WHERE id = v_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order % not found in orders table', v_order_id;
        END IF;

        IF v_order.payment_method != 'cod' THEN
            RAISE EXCEPTION 'Order % is not a COD order', v_order_id;
        END IF;

        IF v_order.status != 'delivered' THEN
            RAISE EXCEPTION 'Order % is not delivered', v_order_id;
        END IF;
        
        IF v_order.cod_collected != true THEN
            RAISE EXCEPTION 'Order % cod_collected is false', v_order_id;
        END IF;

        IF v_order.driver_id != p_driver_id THEN
            RAISE EXCEPTION 'Order % is assigned to a different driver in orders table', v_order_id;
        END IF;

        IF v_cod_collection.amount <= 0 THEN
            RAISE EXCEPTION 'COD amount for order % must be strictly positive', v_order_id;
        END IF;
        
        IF v_cod_collection.amount != v_order.total_amount THEN
            RAISE EXCEPTION 'COD amount mismatch for order %. Operational: %, Authoritative: %', v_order_id, v_cod_collection.amount, v_order.total_amount;
        END IF;

        -- Verify ledger cod_collection evidence exists
        SELECT EXISTS (
            SELECT 1 FROM public.driver_financial_ledger
            WHERE order_id = v_order_id 
            AND transaction_type = 'cod_collection'
            AND driver_id = p_driver_id
        ) INTO v_ledger_evidence_exists;
        
        IF NOT v_ledger_evidence_exists THEN
            RAISE EXCEPTION 'Authoritative ledger cod_collection missing for order %', v_order_id;
        END IF;

        v_total_amount := v_total_amount + v_cod_collection.amount;
    END LOOP;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'Total settlement amount must be strictly positive.';
    END IF;

    -- Validate against authoritative ledger Unsettled COD
    SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('cod_collection', 'cod_settlement') THEN -amount ELSE 0 END), 0)
    INTO v_current_unsettled 
    FROM public.driver_financial_ledger
    WHERE driver_id = p_driver_id;
    
    IF v_total_amount > v_current_unsettled THEN
        RAISE EXCEPTION 'Cannot settle more COD cash than the driver owes (Owes: %, Attempted: %).', v_current_unsettled, v_total_amount;
    END IF;

    -- Atomically Process Settlement
    -- 1. Insert into immutable ledger
    INSERT INTO public.driver_financial_ledger (
        driver_id, amount, transaction_type, description, created_by, metadata
    ) VALUES (
        p_driver_id, v_total_amount, 'cod_settlement', 'Admin Multi-Order COD Settlement', auth.uid(), jsonb_build_object('settlement_reference', p_payment_reference)
    ) RETURNING id INTO v_ledger_entry_id;

    -- 2. Insert settlement tracing
    INSERT INTO public.driver_cod_settlements (
        driver_id, ledger_entry_id, total_amount, payment_reference, settled_by
    ) VALUES (
        p_driver_id, v_ledger_entry_id, v_total_amount, p_payment_reference, auth.uid()
    ) RETURNING id INTO v_settlement_id;

    -- 3. Link operational rows and mark settled
    FOR v_order_id IN SELECT unnest(v_unique_orders)
    LOOP
        SELECT id INTO v_cod_collection FROM public.cod_collections WHERE order_id = v_order_id;
        
        INSERT INTO public.driver_cod_settlement_items (settlement_id, cod_collection_id)
        VALUES (v_settlement_id, v_cod_collection.id);

        UPDATE public.cod_collections 
        SET status = 'settled', collected_by = auth.uid(), collected_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
        WHERE id = v_cod_collection.id;
    END LOOP;

    RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.admin_settle_driver_cod(UUID, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_settle_driver_cod(UUID, UUID[], TEXT) TO authenticated;

-- 4. Correct Analytics RPC to reflect authoritative Driver Unsettled COD
CREATE OR REPLACE FUNCTION public.get_finance_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cod_pending numeric;
  v_cod_collected numeric;
  v_driver_earnings numeric;
  v_platform_commission numeric;
BEGIN
  -- Authoritative: Sum of positive unsettled COD balances across all drivers
  SELECT COALESCE(SUM(GREATEST(unsettled_cod, 0)), 0) INTO v_cod_pending 
  FROM public.driver_financial_summary;
  
  -- Legacy platform paid COD for reference
  SELECT COALESCE(SUM(total_amount), 0) INTO v_cod_collected 
  FROM public.orders 
  WHERE payment_method = 'cod' AND payment_status = 'paid';

  SELECT COALESCE(SUM(earning_amount), 0) INTO v_driver_earnings
  FROM public.driver_earnings;

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_platform_commission
  FROM public.driver_earnings;

  RETURN json_build_object(
    'cod_pending', v_cod_pending,
    'cod_collected', v_cod_collected,
    'driver_earnings_total', v_driver_earnings,
    'platform_commission_total', v_platform_commission
  );
END;
$$;
