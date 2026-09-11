-- 1. Create table
CREATE TYPE driver_transaction_type AS ENUM (
  'delivery_earning',
  'customer_tip',
  'incentive',
  'penalty',
  'cod_collection',
  'cod_settlement',
  'payout',
  'adjustment'
);

CREATE TABLE IF NOT EXISTS public.driver_financial_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  transaction_type driver_transaction_type NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE SET NULL,
  source_reference_id UUID,
  reversal_of_ledger_id UUID REFERENCES public.driver_financial_ledger(id) ON DELETE RESTRICT,
  description TEXT,
  occurred_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB
);

-- 2. Partial Unique Indexes for Idempotency
-- a. Only one cod_collection per order
CREATE UNIQUE INDEX idx_unique_cod_collection
ON public.driver_financial_ledger (order_id)
WHERE transaction_type = 'cod_collection';

-- b. Only one mirrored earning per source_reference_id (which points to driver_earnings.id)
CREATE UNIQUE INDEX idx_unique_delivery_earning
ON public.driver_financial_ledger (source_reference_id)
WHERE transaction_type = 'delivery_earning';

-- c. External reference idempotency for settlements
CREATE UNIQUE INDEX idx_unique_cod_settlement_ref
ON public.driver_financial_ledger ( (metadata->>'settlement_reference') )
WHERE transaction_type = 'cod_settlement' AND metadata->>'settlement_reference' IS NOT NULL;

-- 3. Prevent direct updates/deletes on ledger
CREATE OR REPLACE FUNCTION public.prevent_ledger_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Updates and Deletes are strictly forbidden on driver_financial_ledger. Please insert an adjustment or reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_driver_ledger_updates
BEFORE UPDATE OR DELETE ON public.driver_financial_ledger
FOR EACH ROW
EXECUTE FUNCTION public.prevent_ledger_mutations();

-- 4. Secure Financial Summary View (Security Invoker)
CREATE OR REPLACE VIEW public.driver_financial_summary WITH (security_invoker = true) AS
SELECT
  driver_id,
  SUM(amount) AS pocket_balance,
  SUM(CASE WHEN transaction_type IN ('cod_collection', 'cod_settlement') THEN -amount ELSE 0 END) AS unsettled_cod,
  SUM(CASE WHEN transaction_type = 'delivery_earning' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN amount ELSE 0 END) AS weekly_earnings,
  SUM(CASE WHEN transaction_type = 'customer_tip' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN amount ELSE 0 END) AS weekly_tips,
  SUM(CASE WHEN transaction_type = 'penalty' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN -amount ELSE 0 END) AS weekly_deductions
FROM public.driver_financial_ledger
GROUP BY driver_id;

-- 5. RLS Policies
ALTER TABLE public.driver_financial_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own ledger"
ON public.driver_financial_ledger
FOR SELECT
USING (auth.uid() = driver_id);

CREATE POLICY "Admins can view ledger for their warehouse"
ON public.driver_financial_ledger
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles admin_prof, profiles driver_prof
    WHERE admin_prof.id = auth.uid()
    AND admin_prof.role = 'admin'
    AND driver_prof.id = driver_financial_ledger.driver_id
    AND (admin_prof.warehouse_id IS NULL OR admin_prof.warehouse_id = driver_prof.warehouse_id)
  )
);

-- 6. RPC: apply_driver_penalty
CREATE OR REPLACE FUNCTION public.apply_driver_penalty(
  p_driver_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_order_id UUID DEFAULT NULL,
  p_trip_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_admin_warehouse UUID;
  v_driver_warehouse UUID;
  v_ledger_id UUID;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can apply penalties.';
  END IF;

  -- Validate amount > 0
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Penalty amount must be strictly positive.';
  END IF;
  
  IF length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Penalty reason cannot be empty.';
  END IF;

  -- Scoping validation
  SELECT warehouse_id INTO v_admin_warehouse FROM public.profiles WHERE id = auth.uid();
  SELECT warehouse_id INTO v_driver_warehouse FROM public.profiles WHERE id = p_driver_id;

  IF v_admin_warehouse IS NOT NULL AND v_admin_warehouse != v_driver_warehouse THEN
    RAISE EXCEPTION 'Unauthorized: Admin warehouse does not match driver warehouse.';
  END IF;

  -- Insert negative amount
  INSERT INTO public.driver_financial_ledger (
    driver_id, amount, transaction_type, order_id, trip_id, description, created_by
  ) VALUES (
    p_driver_id, -p_amount, 'penalty', p_order_id, p_trip_id, p_reason, auth.uid()
  ) RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: settle_driver_cod
CREATE OR REPLACE FUNCTION public.settle_driver_cod(
  p_driver_id UUID,
  p_amount NUMERIC,
  p_reference_number TEXT
) RETURNS UUID AS $$
DECLARE
  v_admin_warehouse UUID;
  v_driver_warehouse UUID;
  v_current_unsettled NUMERIC;
  v_ledger_id UUID;
BEGIN
  -- Validate caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can settle COD.';
  END IF;

  -- Validate amount > 0
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be strictly positive.';
  END IF;

  -- Scoping validation
  SELECT warehouse_id INTO v_admin_warehouse FROM public.profiles WHERE id = auth.uid();
  SELECT warehouse_id INTO v_driver_warehouse FROM public.profiles WHERE id = p_driver_id;

  IF v_admin_warehouse IS NOT NULL AND v_admin_warehouse != v_driver_warehouse THEN
    RAISE EXCEPTION 'Unauthorized: Admin warehouse does not match driver warehouse.';
  END IF;

  -- Check current unsettled COD
  SELECT COALESCE(unsettled_cod, 0) INTO v_current_unsettled FROM public.driver_financial_summary WHERE driver_id = p_driver_id;
  
  IF p_amount > v_current_unsettled THEN
    RAISE EXCEPTION 'Cannot settle more COD cash than the driver currently owes (Owes: %, Attempted: %).', v_current_unsettled, p_amount;
  END IF;

  -- Insert positive amount
  INSERT INTO public.driver_financial_ledger (
    driver_id, amount, transaction_type, description, created_by, metadata
  ) VALUES (
    p_driver_id, p_amount, 'cod_settlement', 'COD Settlement to Admin', auth.uid(), jsonb_build_object('settlement_reference', p_reference_number)
  ) RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Triggers for Automatic Events
CREATE OR REPLACE FUNCTION public.trg_mirror_driver_financials()
RETURNS TRIGGER AS $$
BEGIN
  -- If earning is inserted
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'driver_earnings' THEN
    INSERT INTO public.driver_financial_ledger (
      driver_id, amount, transaction_type, order_id, source_reference_id, description, occurred_at
    ) VALUES (
      NEW.driver_id, NEW.earning_amount, 'delivery_earning', NEW.order_id, NEW.id, 'Base Delivery Earning', NEW.created_at
    ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'delivery_earning' DO NOTHING;
    RETURN NEW;
  END IF;

  -- If order COD is collected
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'orders' THEN
    -- Detect state transition into cod_collected = true
    IF NEW.cod_collected = true AND (OLD.cod_collected IS NULL OR OLD.cod_collected = false) AND NEW.payment_method = 'cod' THEN
      -- Only process if driver is known
      IF NEW.driver_id IS NOT NULL THEN
         INSERT INTO public.driver_financial_ledger (
           driver_id, amount, transaction_type, order_id, description, occurred_at
         ) VALUES (
           NEW.driver_id, -NEW.total_amount, 'cod_collection', NEW.id, 'COD Collected', NEW.updated_at
         ) ON CONFLICT (order_id) WHERE transaction_type = 'cod_collection' DO NOTHING;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_driver_earning_inserted
AFTER INSERT ON public.driver_earnings
FOR EACH ROW EXECUTE FUNCTION public.trg_mirror_driver_financials();

CREATE TRIGGER on_order_cod_collected
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_mirror_driver_financials();

-- 9. Backfill existing earnings
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM public.driver_earnings LOOP
    INSERT INTO public.driver_financial_ledger (
      driver_id, amount, transaction_type, order_id, source_reference_id, description, occurred_at, created_at
    ) VALUES (
      r.driver_id, r.earning_amount, 'delivery_earning', r.order_id, r.id, 'Historical Base Delivery Earning', r.created_at, timezone('utc'::text, now())
    ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'delivery_earning' DO NOTHING;
  END LOOP;
END $$;
