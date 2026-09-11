-- 1. Create refunds table
CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for refunds
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read self refunds" ON public.refunds FOR SELECT USING (auth.uid() = customer_id);

-- 2. Atomic process_refund RPC
CREATE OR REPLACE FUNCTION public.process_refund(
    p_order_id UUID,
    p_amount DECIMAL,
    p_reason TEXT,
    p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_payment_transaction RECORD;
    v_total_refunded DECIMAL(12,2) := 0;
    v_refund_id UUID;
    v_wallet_balance DECIMAL(12,2);
BEGIN
    -- 1. Fetch Order and lock it
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Security: Ensure the caller is either the customer or has adequate permissions
    -- (Admin/picker could be processing the refund via OOS, or customer cancelling).
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Not authenticated';
    END IF;
    -- We allow customer, admin, or picker to initiate refunds for now.
    IF auth.uid() != v_order.customer_id THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'picker')) THEN
            RAISE EXCEPTION 'Unauthorized refund attempt';
        END IF;
    END IF;

    -- 2. Verify idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.refunds WHERE idempotency_key = p_idempotency_key) THEN
            RAISE EXCEPTION 'Idempotency conflict: refund already processed';
        END IF;
    END IF;
    
    -- 3. Check existing payment transaction
    -- If it's a COD order that hasn't been paid, or if payment failed, we cannot refund.
    IF v_order.payment_status != 'paid' THEN
        RAISE EXCEPTION 'Cannot refund an order that is not in paid status. Current status: %', v_order.payment_status;
    END IF;

    -- Calculate total already refunded
    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded FROM public.refunds WHERE order_id = p_order_id AND status = 'completed';
    
    IF (v_total_refunded + p_amount) > v_order.total_amount THEN
        RAISE EXCEPTION 'Refund amount (%) exceeds remaining refundable amount (%)', p_amount, (v_order.total_amount - v_total_refunded);
    END IF;

    -- Fetch the successful payment transaction for reference
    SELECT * INTO v_payment_transaction FROM public.payment_transactions 
    WHERE order_id = p_order_id AND status = 'paid' LIMIT 1;
    
    -- 4. Credit Wallet (for wallet payments)
    IF v_order.payment_method = 'wallet' THEN
        -- Lock profile
        SELECT wallet_balance INTO v_wallet_balance FROM public.profiles WHERE id = v_order.customer_id FOR UPDATE;
        
        -- Credit profile
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = v_order.customer_id;
        
        -- Insert wallet transaction
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (v_order.customer_id, p_amount, 'credit', p_reason);
    END IF;

    -- 5. Create refund record
    INSERT INTO public.refunds (
        order_id,
        customer_id,
        payment_transaction_id,
        amount,
        reason,
        status,
        idempotency_key
    ) VALUES (
        p_order_id,
        v_order.customer_id,
        v_payment_transaction.id,
        p_amount,
        p_reason,
        'completed',
        p_idempotency_key
    ) RETURNING id INTO v_refund_id;

    -- 6. Update order payment status
    IF (v_total_refunded + p_amount) = v_order.total_amount THEN
        UPDATE public.orders SET payment_status = 'refunded', updated_at = now() WHERE id = p_order_id;
        UPDATE public.payment_transactions SET status = 'refunded', updated_at = now() WHERE order_id = p_order_id AND status = 'paid';
    END IF;

    RETURN v_refund_id;
END;
$$;
