-- Phase 20: Secure Admin Order Mutations

-- 1. Create trigger for order cancellation reservations
CREATE OR REPLACE FUNCTION release_reservation_on_cancellation()
RETURNS TRIGGER AS $$
BEGIN
    -- This strictly relies on the idempotent release_order_reservations
    PERFORM release_order_reservations(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_release_reservation ON public.orders;
CREATE TRIGGER trigger_release_reservation
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
EXECUTE FUNCTION release_reservation_on_cancellation();

-- 2. Create admin_cancel_order RPC
CREATE OR REPLACE FUNCTION admin_cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_admin BOOLEAN;
BEGIN
    -- Verify Admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can cancel orders';
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'cancelled' THEN
        RETURN; -- Idempotent
    END IF;

    IF v_order.status = 'delivered' THEN
        RAISE EXCEPTION 'Cannot cancel a delivered order';
    END IF;

    -- Handle wallet refund
    IF v_order.payment_status = 'paid' AND v_order.payment_method = 'wallet' THEN
        -- Reusing process_refund securely
        PERFORM public.process_refund(
            p_order_id, 
            v_order.total_amount, 
            'Admin cancellation: ' || p_reason, 
            gen_random_uuid()
        );
    END IF;

    -- Update order status
    UPDATE public.orders 
    SET 
        status = 'cancelled', 
        payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
        updated_at = now()
    WHERE id = p_order_id;
    
    -- The trigger trigger_release_reservation will handle stock release.
    -- The trigger handle_order_cancellation will handle driver trip detachment.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create admin_assign_picker RPC
CREATE OR REPLACE FUNCTION admin_assign_picker(p_order_id UUID, p_picker_id UUID)
RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_admin BOOLEAN;
    v_picker RECORD;
BEGIN
    -- Verify Admin
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can assign pickers manually';
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status != 'placed' THEN
        RAISE EXCEPTION 'Cannot assign picker to an order that is not in placed status';
    END IF;

    -- Verify Picker
    SELECT * INTO v_picker FROM public.profiles WHERE id = p_picker_id;
    
    IF v_picker.id IS NULL OR v_picker.role != 'picker' THEN
        RAISE EXCEPTION 'Target user is not a valid picker';
    END IF;

    IF COALESCE(v_picker.is_suspended, FALSE) = TRUE THEN
        RAISE EXCEPTION 'Target picker is suspended';
    END IF;

    IF v_picker.warehouse_id != v_order.warehouse_id THEN
        RAISE EXCEPTION 'Target picker does not belong to the correct warehouse';
    END IF;

    -- Set picker_id only (Picker must call start_picking)
    UPDATE public.orders 
    SET picker_id = p_picker_id, updated_at = now()
    WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Tighten RLS on orders to block frontend state machine overrides
-- Drop Admin update policy
DROP POLICY IF EXISTS "Admin update operational orders" ON public.orders;

-- Drop Picker update policy (legacy web view security hole)
DROP POLICY IF EXISTS "Picker update assigned orders" ON public.orders;
