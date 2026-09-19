-- Migration: 20260919165200_fix_support_ticket_resolve.sql

CREATE OR REPLACE FUNCTION public.admin_update_ticket_status(p_ticket_id UUID, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_customer UUID;
    v_old_status TEXT;
BEGIN
    -- Verify caller is admin
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN 
        RAISE EXCEPTION 'Unauthorized'; 
    END IF;

    -- Lock the ticket and verify it exists
    SELECT status, customer_id INTO v_old_status, v_customer 
    FROM public.support_tickets 
    WHERE id = p_ticket_id FOR UPDATE;

    IF v_old_status IS NULL AND v_customer IS NULL THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Maintain idempotency
    IF v_old_status = p_status THEN 
        RETURN FALSE; 
    END IF;

    -- Update the ticket
    UPDATE public.support_tickets SET status = p_status, updated_at = now() WHERE id = p_ticket_id;

    -- Notify the customer
    PERFORM public.write_notification(
        v_customer, 'SUPPORT_TICKET_UPDATED', 'Support Ticket Updated',
        'Your support ticket status is now: ' || p_status,
        'support_tickets', p_ticket_id::text, 'ticket_update_' || p_ticket_id::text || '_' || p_status,
        jsonb_build_object('route', '/customer/support')
    );

    -- Successfully completed the flow
    RETURN TRUE;
END;
$BODY$;
