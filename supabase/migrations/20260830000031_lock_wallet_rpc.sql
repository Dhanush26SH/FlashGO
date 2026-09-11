-- 20260830000031_lock_wallet_rpc.sql

-- Fully lock process_wallet_transaction to Admin only.
-- Customers use process_checkout to deduct wallet funds during purchases.
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
BEGIN
    PERFORM set_config('flashgo.internal_mutation', 'true', true);
    
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

    -- Restrict entirely to Admin
    IF v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can perform manual wallet adjustments';
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
