-- 20260902000001_phase21_closure.sql

-- 1. Ensure refunds table supports pending_external
ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (
    status IN ('pending', 'completed', 'failed', 'pending_external')
);

-- 2. Create customer RPC for ticket submission securely
CREATE OR REPLACE FUNCTION public.create_order_item_issue(
    p_order_id UUID,
    p_order_item_id UUID,
    p_category TEXT,
    p_quantity INTEGER,
    p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_customer_id UUID;
    v_customer_name TEXT;
    v_order RECORD;
    v_order_item RECORD;
    v_ticket_id UUID;
BEGIN
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT full_name INTO v_customer_name FROM public.profiles WHERE id = v_customer_id;

    -- Validate order belongs to customer
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND customer_id = v_customer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or does not belong to you';
    END IF;
    
    IF v_order.status != 'delivered' THEN
        RAISE EXCEPTION 'Issues can only be reported for delivered orders';
    END IF;

    -- Validate order item belongs to order
    SELECT * INTO v_order_item FROM public.order_items WHERE id = p_order_item_id AND order_id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item not found in this order';
    END IF;

    IF p_quantity < 1 OR p_quantity > v_order_item.quantity THEN
        RAISE EXCEPTION 'Invalid quantity';
    END IF;

    -- Insert ticket
    INSERT INTO public.support_tickets (
        customer_id,
        customer_name,
        related_order_id,
        order_item_id,
        category,
        affected_quantity,
        subject,
        description,
        priority,
        status
    ) VALUES (
        v_customer_id,
        v_customer_name,
        p_order_id,
        p_order_item_id,
        p_category,
        p_quantity,
        'Issue with item',
        p_description,
        'medium',
        'open'
    ) RETURNING id INTO v_ticket_id;

    RETURN v_ticket_id;
END;
$BODY$;

-- 3. Update admin_resolve_ticket_and_refund to handle external payments
CREATE OR REPLACE FUNCTION public.admin_resolve_ticket_and_refund(
    p_ticket_id UUID,
    p_refund_amount DECIMAL,
    p_refunded_quantity INTEGER,
    p_resolution_note TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_ticket RECORD;
    v_order RECORD;
    v_order_item RECORD;
    v_total_refunded_amount DECIMAL(12,2) := 0;
    v_total_refunded_qty INTEGER := 0;
    v_max_refundable_qty INTEGER;
    v_max_refundable_amount DECIMAL(12,2);
    v_refund_id UUID;
    v_order_total_refunded DECIMAL(12,2) := 0;
    v_refund_status TEXT;
BEGIN
    -- 1. Security Check
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can process ticket refunds';
    END IF;

    -- 2. Fetch and Lock Ticket
    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;
    IF v_ticket.status = 'resolved' OR v_ticket.status = 'closed' THEN
        RAISE EXCEPTION 'Ticket is already resolved or closed';
    END IF;

    -- 3. Validate Linkage
    IF v_ticket.related_order_id IS NULL OR v_ticket.order_item_id IS NULL THEN
        RAISE EXCEPTION 'Ticket is not linked to a specific order item';
    END IF;

    -- 4. Fetch and Lock Order (to prevent concurrent partial refunds from exceeding total)
    SELECT * INTO v_order FROM public.orders WHERE id = v_ticket.related_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked order not found';
    END IF;

    -- 5. Fetch Order Item
    SELECT * INTO v_order_item FROM public.order_items WHERE id = v_ticket.order_item_id AND order_id = v_ticket.related_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item not found or does not belong to the linked order';
    END IF;

    -- Validate quantities
    IF p_refunded_quantity > v_order_item.quantity THEN
        RAISE EXCEPTION 'Cannot refund more physical quantity than was purchased';
    END IF;

    -- Calculate previous refunds on this specific item (only completed refunds count towards max)
    SELECT 
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(refunded_quantity), 0)
    INTO 
        v_total_refunded_amount,
        v_total_refunded_qty
    FROM public.refunds
    WHERE order_item_id = v_ticket.order_item_id AND status = 'completed';

    -- Determine remaining eligible
    v_max_refundable_qty := v_order_item.quantity - v_total_refunded_qty;
    v_max_refundable_amount := (v_order_item.price * v_order_item.quantity) - v_total_refunded_amount;

    IF p_refunded_quantity > v_max_refundable_qty THEN
        RAISE EXCEPTION 'Requested refund quantity (%) exceeds remaining refundable quantity (%)', p_refunded_quantity, v_max_refundable_qty;
    END IF;
    IF p_refund_amount > v_max_refundable_amount THEN
        RAISE EXCEPTION 'Requested refund amount (%) exceeds remaining refundable amount (%)', p_refund_amount, v_max_refundable_amount;
    END IF;
    IF p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be strictly positive';
    END IF;

    -- 6. Process the refund destination
    IF v_order.payment_method IN ('wallet', 'cod') THEN
        v_refund_status := 'completed';
        
        -- Credit profile wallet
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_refund_amount WHERE id = v_ticket.customer_id;
        
        -- Insert wallet transaction
        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (v_ticket.customer_id, p_refund_amount, 'credit', 'Refund for Ticket ' || SUBSTRING(p_ticket_id::text FROM 1 FOR 8));
    ELSE
        v_refund_status := 'pending_external';
        -- Do not credit wallet for external payments
    END IF;

    -- 7. Insert into Refunds table
    INSERT INTO public.refunds (
        order_id,
        order_item_id,
        support_ticket_id,
        customer_id,
        amount,
        refunded_quantity,
        reason,
        status,
        idempotency_key
    ) VALUES (
        v_order.id,
        v_order_item.id,
        v_ticket.id,
        v_ticket.customer_id,
        p_refund_amount,
        p_refunded_quantity,
        p_resolution_note,
        v_refund_status,
        v_ticket.id::text
    ) RETURNING id INTO v_refund_id;

    -- 8. Update Order Payment Status
    SELECT COALESCE(SUM(amount), 0) INTO v_order_total_refunded FROM public.refunds WHERE order_id = v_order.id AND status = 'completed';
    
    IF v_order_total_refunded >= v_order.total_amount THEN
        UPDATE public.orders SET payment_status = 'refunded', updated_at = now() WHERE id = v_order.id;
    ELSIF v_order_total_refunded > 0 THEN
        UPDATE public.orders SET payment_status = 'partially_refunded', updated_at = now() WHERE id = v_order.id;
    END IF;

    -- 9. Update Support Ticket
    UPDATE public.support_tickets 
    SET 
        status = 'resolved',
        description = CASE WHEN description IS NULL THEN p_resolution_note ELSE description || CHR(10) || CHR(10) || 'Admin Note: ' || p_resolution_note END,
        updated_at = now()
    WHERE id = p_ticket_id;

    RETURN v_refund_id;
END;
$BODY$;
