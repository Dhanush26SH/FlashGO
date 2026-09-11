-- Migration: 20260830000030_drop_old_policies.sql

DROP POLICY IF EXISTS "Customers can create support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Customer creates own tickets" ON public.support_tickets;

-- Recreate it incorporating both the order ID check AND the suspension check
CREATE POLICY "Customer creates own tickets" ON public.support_tickets FOR INSERT WITH CHECK (
  auth.uid() = customer_id AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_suspended IS NULL OR is_suspended = FALSE)
  ) AND
  (related_order_id IS NULL OR EXISTS (SELECT 1 FROM public.orders WHERE id = related_order_id AND customer_id = auth.uid()))
);

-- Fix process_wallet_transaction to allow wallet modification
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
    PERFORM set_config('flashgo.internal_mutation', 'true', true);
    
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

    -- If caller is a customer, they can ONLY debit their own wallet (e.g. paying for an order).
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

