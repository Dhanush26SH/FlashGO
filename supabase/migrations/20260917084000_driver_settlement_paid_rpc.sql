-- Migration: 20260917000002_driver_settlement_paid_rpc.sql

-- Mark Driver Settlement Paid
CREATE OR REPLACE FUNCTION public.mark_driver_settlement_paid(
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
    SELECT * INTO v_settlement FROM public.driver_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement not found';
    END IF;

    IF v_settlement.status = 'paid' THEN
        RAISE EXCEPTION 'Settlement is already paid';
    END IF;

    IF v_settlement.net_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement net amount must be greater than zero to be payable';
    END IF;

    UPDATE public.driver_settlements
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
REVOKE ALL ON FUNCTION public.mark_driver_settlement_paid(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_driver_settlement_paid(UUID, TEXT, TEXT, TEXT) TO authenticated;
