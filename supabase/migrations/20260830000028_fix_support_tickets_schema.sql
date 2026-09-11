-- 20260830000028_fix_support_tickets_schema.sql

-- 1. Safely rename and add columns for support_tickets
ALTER TABLE public.support_tickets RENAME COLUMN issue_type TO category;
ALTER TABLE public.support_tickets RENAME COLUMN order_id TO related_order_id;

ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT 'General Inquiry';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'low';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Clean up any rogue data before enforcing constraints (since DB is currently empty for tickets, this is safe)
UPDATE public.support_tickets SET status = 'open' WHERE status NOT IN ('open', 'in_progress', 'resolved', 'closed');
UPDATE public.support_tickets SET priority = 'low' WHERE priority NOT IN ('low', 'medium', 'high', 'urgent');
UPDATE public.support_tickets SET category = 'Other' WHERE category NOT IN ('Missing Item', 'Wrong Item', 'Damaged Item', 'Late Delivery', 'Payment', 'Refund', 'Other');

-- 2. Constraints
ALTER TABLE public.support_tickets ADD CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
ALTER TABLE public.support_tickets ADD CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE public.support_tickets ADD CONSTRAINT valid_category CHECK (category IN ('Missing Item', 'Wrong Item', 'Damaged Item', 'Late Delivery', 'Payment', 'Refund', 'Other'));

-- 3. Security (RLS) for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer manage own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admin Support manage tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Customers view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Customers create own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins full access to tickets" ON public.support_tickets;

CREATE POLICY "Customer reads own tickets" ON public.support_tickets FOR SELECT USING (auth.uid() = customer_id);

-- Customer can insert, but must not spoof customer_id and related_order_id must belong to them (or be null)
CREATE POLICY "Customer creates own tickets" ON public.support_tickets FOR INSERT WITH CHECK (
  auth.uid() = customer_id AND
  (related_order_id IS NULL OR EXISTS (SELECT 1 FROM public.orders WHERE id = related_order_id AND customer_id = auth.uid()))
);

-- Admin can do anything
CREATE POLICY "Admin full access tickets" ON public.support_tickets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 4. Security (RLS) for support_ticket_messages
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers read own ticket messages" ON public.support_ticket_messages;
DROP POLICY IF EXISTS "Customers insert messages on own tickets" ON public.support_ticket_messages;
DROP POLICY IF EXISTS "Admins full access to ticket messages" ON public.support_ticket_messages;

CREATE POLICY "Customer reads own messages" ON public.support_ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.support_tickets WHERE id = support_ticket_messages.ticket_id AND customer_id = auth.uid())
);

CREATE POLICY "Customer inserts own messages" ON public.support_ticket_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.support_tickets WHERE id = support_ticket_messages.ticket_id AND customer_id = auth.uid())
);

CREATE POLICY "Admin full access messages" ON public.support_ticket_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 5. Secure RPC for updating ticket status (Admin only)
CREATE OR REPLACE FUNCTION admin_update_ticket_status(p_ticket_id UUID, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update ticket status';
    END IF;

    UPDATE public.support_tickets
    SET status = p_status, updated_at = NOW()
    WHERE id = p_ticket_id;

    RETURN TRUE;
END;
$$;

-- 6. Fix process_wallet_transaction Security
CREATE OR REPLACE FUNCTION process_wallet_transaction(
    p_user_id UUID,
    p_amount DECIMAL,
    p_tx_type tx_type,
    p_description TEXT
) RETURNS BOOLEAN 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance DECIMAL;
    v_caller_role TEXT;
    v_is_suspended BOOLEAN;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

    -- If caller is a customer, they can ONLY debit their own wallet (e.g. paying for an order).
    -- They CANNOT credit their own wallet without an external payment webhook (which uses service_role or admin).
    IF v_caller_role = 'customer' THEN
        IF auth.uid() != p_user_id THEN
            RAISE EXCEPTION 'Customers can only transact on their own wallet';
        END IF;

        IF p_tx_type = 'credit' THEN
            RAISE EXCEPTION 'Customers cannot arbitrarily credit their own wallet. Must use a payment gateway.';
        END IF;

        SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
        FROM public.profiles WHERE id = p_user_id;

        IF v_is_suspended = TRUE THEN
            RAISE EXCEPTION 'Account % is suspended. Wallet operations are blocked.', p_user_id;
        END IF;
    ELSIF v_caller_role != 'admin' THEN
        -- Only customers (debit only) and admins (all) can call this via API. (Edge functions use service role which bypasses RLS/caller checks)
        -- Actually, driver roles might need to settle COD, but that is done via `driver_cod_settlement`.
        -- So for arbitrary wallet transactions, only Admin or the user themselves for debit is allowed.
        RAISE EXCEPTION 'Unauthorized wallet operation';
    END IF;

    -- Lock the row for update
    SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    
    IF p_tx_type = 'debit' AND v_current_balance < p_amount THEN
        RETURN FALSE; -- Insufficient funds
    END IF;

    IF p_tx_type = 'credit' THEN
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
    ELSE
        UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount WHERE id = p_user_id;
    END IF;

    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_amount, p_tx_type, p_description);

    RETURN TRUE;
END;
$$;

-- 7. Fix Coupons Mutation Security
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access on coupons" ON public.coupons;
DROP POLICY IF EXISTS "Allow admin all access on coupons" ON public.coupons;

CREATE POLICY "Anyone can view active coupons" ON public.coupons FOR SELECT USING (active = true);
CREATE POLICY "Admins full access to coupons" ON public.coupons FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);
