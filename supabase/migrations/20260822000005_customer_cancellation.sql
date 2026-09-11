-- Secure Customer Order Cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order public.orders%ROWTYPE;
BEGIN
    -- 1. Fetch order using server-side authority
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- 2. Verify Ownership
    IF v_order.customer_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this order';
    END IF;

    -- 3. Check Lifecycle Status
    IF v_order.status = 'cancelled' THEN
        -- Idempotency check: Already cancelled
        RETURN;
    END IF;

    IF v_order.status != 'placed' THEN
        RAISE EXCEPTION 'Order cannot be cancelled at this stage (status: %)', v_order.status;
    END IF;

    -- 4. Route Cancellation based on Payment Method
    IF v_order.payment_method = 'cod' THEN
        -- For COD, just mark as cancelled.
        -- (The trigger handle_order_cancellation will detach from trip if necessary).
        UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = p_order_id;

    ELSIF v_order.payment_method = 'wallet' THEN
        -- For Wallet, refund atomically via existing RPC
        PERFORM public.process_refund(p_order_id, v_order.total_amount, 'Customer cancellation (Wallet)', gen_random_uuid());
        -- Note: process_refund updates the order status to 'refunded' if full amount is refunded.
        -- We explicitly set it to cancelled to signify the lifecycle state, but payment_status becomes refunded.
        UPDATE public.orders SET status = 'cancelled', payment_status = 'refunded', updated_at = now() WHERE id = p_order_id;

    ELSIF v_order.payment_method IN ('upi', 'card') THEN
        -- For external gateways, we don't refund synchronously here.
        -- The Edge Function `customer-cancel-order` handles this.
        -- If this RPC was called by mistake for external payments, throw an error.
        RAISE EXCEPTION 'External payment refunds must be processed through the secure gateway cancellation flow.';
    ELSE
        RAISE EXCEPTION 'Unknown payment method: %', v_order.payment_method;
    END IF;

END;
$$;
