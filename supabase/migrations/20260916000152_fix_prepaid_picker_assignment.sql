-- Migration: 20260916000152_fix_prepaid_picker_assignment.sql
-- Description: Fix missing picker assignment for prepaid orders by explicitly invoking auto_assign_picker upon payment success.

CREATE OR REPLACE FUNCTION public.resolve_external_payment(p_order_id uuid, p_transaction_id text, p_amount numeric, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order                  RECORD;
    v_payment_transaction_id UUID;
BEGIN
    -- 1. Lock the order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- 2. Handle late successful payment on already-terminal order
    --    (expired / failed before Razorpay callback arrived)
    IF v_order.status IN ('payment_expired', 'payment_failed') THEN
        -- Record the provider payment — customer was charged
        INSERT INTO public.payment_transactions (
            order_id, user_id, amount, payment_method, status,
            transaction_id, idempotency_key
        )
        VALUES (
            p_order_id, v_order.customer_id, p_amount,
            v_order.payment_method, 'refund_pending',
            p_transaction_id, p_idempotency_key
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        -- Emit event for reconciliation
        INSERT INTO public.order_events (
            order_id, actor_id, actor_role, event_type,
            previous_status, new_status, description, metadata, idempotency_key
        )
        VALUES (
            p_order_id, NULL, 'system', 'late_payment_received',
            v_order.status, v_order.status,
            'Razorpay payment received after order was already ' || v_order.status,
            jsonb_build_object(
                'transaction_id', p_transaction_id,
                'amount',         p_amount,
                'order_status',   v_order.status
            ),
            'late_pay_' || p_idempotency_key
        )
        ON CONFLICT (order_id, idempotency_key) DO NOTHING;

        -- Return structured error — edge function must trigger Razorpay refund
        RETURN jsonb_build_object(
            'code',         'ORDER_EXPIRED_LATE_PAYMENT',
            'order_status', v_order.status,
            'refund_due',   true,
            'amount',       p_amount,
            'transaction_id', p_transaction_id
        );
    END IF;

    -- 3. Guard: must be payment_pending for normal happy path
    IF v_order.payment_status != 'pending' THEN
        -- Already paid (idempotent duplicate callback)
        RETURN jsonb_build_object('code', 'ALREADY_PAID');
    END IF;

    -- 4. Guard: correct payment method
    IF v_order.payment_method NOT IN ('upi', 'card') THEN
        RAISE EXCEPTION 'Order payment method does not support external resolution';
    END IF;

    -- 5. Amount validation
    IF p_amount != v_order.total_amount THEN
        RAISE EXCEPTION 'Amount mismatch: expected %, received %', v_order.total_amount, p_amount;
    END IF;

    -- 6. Idempotency
    IF EXISTS (
        SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key
    ) THEN
        RETURN jsonb_build_object('code', 'ALREADY_PROCESSED');
    END IF;

    -- 7. Record payment
    INSERT INTO public.payment_transactions (
        order_id, user_id, amount, payment_method, status,
        transaction_id, idempotency_key
    )
    VALUES (
        p_order_id, v_order.customer_id, p_amount,
        v_order.payment_method, 'paid',
        p_transaction_id, p_idempotency_key
    )
    RETURNING id INTO v_payment_transaction_id;

    -- 8. Transition order to placed
    UPDATE public.orders
    SET status         = 'placed'::public.order_status,
        payment_status = 'paid',
        updated_at     = now()
    WHERE id = p_order_id;

    -- 9. Loyalty points
    UPDATE public.profiles
    SET loyalty_points = loyalty_points + FLOOR(p_amount / 2)
    WHERE id = v_order.customer_id;

    -- 10. Emit payment_verified + order_placed events
    INSERT INTO public.order_events (
        order_id, actor_id, actor_role, event_type,
        previous_status, new_status, description, metadata, idempotency_key
    )
    VALUES (
        p_order_id, NULL, 'system', 'payment_verified',
        'payment_pending', 'placed',
        'Razorpay payment verified',
        jsonb_build_object('transaction_id', p_transaction_id, 'amount', p_amount),
        'pay_verified_' || p_idempotency_key
    ),
    (
        p_order_id, v_order.customer_id, 'customer', 'order_placed',
        'payment_pending', 'placed',
        'Order placed after payment verification',
        jsonb_build_object('payment_method', v_order.payment_method),
        'order_placed_' || p_order_id
    )
    ON CONFLICT (order_id, idempotency_key) DO NOTHING;

    -- 11. Auto-assign picker now that the order is fully placed and paid
    --     Wrapped in EXCEPTION to ensure unexpected assignment failures DO NOT roll back the payment resolution.
    BEGIN
        PERFORM public.auto_assign_picker(p_order_id);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING
                'Picker auto-assignment failed for prepaid order %: %',
                p_order_id,
                SQLERRM;
    END;

    RETURN jsonb_build_object('code', 'SUCCESS', 'payment_transaction_id', v_payment_transaction_id);
END;
$function$;
