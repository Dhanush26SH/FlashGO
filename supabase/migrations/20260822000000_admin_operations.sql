-- Phase 14.6: Admin Operations Realization

-- 1. Profile Suspension
ALTER TABLE public.profiles 
ADD COLUMN is_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN suspended_at TIMESTAMPTZ,
ADD COLUMN suspension_reason TEXT;

-- We don't want broad UPDATE policies on profiles. Instead, we use specific secure RPCs.
CREATE OR REPLACE FUNCTION suspend_profile(p_user_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET is_suspended = TRUE, 
      suspended_at = NOW(), 
      suspension_reason = p_reason 
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION unsuspend_profile(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET is_suspended = FALSE, 
      suspended_at = NULL, 
      suspension_reason = NULL 
  WHERE id = p_user_id;
END;
$$;

-- Secure Staff Approval RPC
CREATE OR REPLACE FUNCTION approve_staff_role(p_user_id UUID, p_role public.user_role, p_employee_id TEXT, p_clean_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET role = p_role, 
      full_name = p_clean_name,
      employee_id = p_employee_id
  WHERE id = p_user_id;
END;
$$;


-- 2. Platform Settings
-- Single row enforced by an ID constraint
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  base_delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 2.99,
  free_delivery_threshold NUMERIC(10,2) NOT NULL DEFAULT 15.00,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_check CHECK (id = 1)
);

INSERT INTO public.platform_settings (id, base_delivery_fee, free_delivery_threshold)
VALUES (1, 30.00, 150.00)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "Only admins can update settings" ON public.platform_settings
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);


-- 3. Support Tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  related_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open, resolved
  priority TEXT NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers view own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Customers create own tickets" ON public.support_tickets FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Admins full access to tickets" ON public.support_tickets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read own ticket messages" ON public.support_ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets WHERE id = support_ticket_messages.ticket_id AND customer_id = auth.uid())
);
CREATE POLICY "Customers insert messages on own tickets" ON public.support_ticket_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.support_tickets WHERE id = support_ticket_messages.ticket_id AND customer_id = auth.uid())
  AND auth.uid() = sender_id
);
CREATE POLICY "Admins full access to ticket messages" ON public.support_ticket_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Realtime for Support Tickets
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.support_ticket_messages;

-- 4. Staff Shifts
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  shift_start TIMESTAMPTZ NOT NULL,
  shift_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, present, absent, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_shift_time CHECK (shift_end > shift_start)
);

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view own shifts" ON public.staff_shifts FOR SELECT USING (auth.uid() = staff_id);
CREATE POLICY "Admins full access to shifts" ON public.staff_shifts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);


-- 5. Coupons Enhancement
-- Ensure date checks and unique codes
ALTER TABLE public.coupons 
ADD CONSTRAINT unique_coupon_code UNIQUE (code),
ADD CONSTRAINT check_valid_discount CHECK (discount_value > 0),
ADD COLUMN valid_from TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN valid_until TIMESTAMPTZ;

-- Stronger RLS for Coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;
CREATE POLICY "Anyone can read active coupons" ON public.coupons FOR SELECT USING (
  active = true 
  AND (valid_from IS NULL OR valid_from <= NOW())
  AND (valid_until IS NULL OR valid_until >= NOW())
);

CREATE POLICY "Admins can see all coupons" ON public.coupons FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Only admins can insert coupons" ON public.coupons FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Only admins can update coupons" ON public.coupons FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Only admins can delete coupons" ON public.coupons FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
