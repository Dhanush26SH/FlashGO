-- Phase 17.2: Substitution Reservation Integrity

CREATE OR REPLACE FUNCTION handle_approved_substitution() RETURNS TRIGGER AS $$
DECLARE
    v_order RECORD;
    v_sellable INTEGER;
BEGIN
    IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
        -- Get order to find warehouse
        SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
        
        -- Check if sellable quantity is sufficient for the suggested substitute
        v_sellable := get_sellable_quantity(v_order.warehouse_id, NEW.suggested_product_id);
        
        IF v_sellable < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for substitute product % (Requires %, Available %)', NEW.suggested_product_id, NEW.quantity, v_sellable;
        END IF;

        -- Create reservation for substitute
        INSERT INTO public.inventory_reservations (
            order_id, 
            warehouse_id, 
            product_id, 
            quantity, 
            status
        ) VALUES (
            NEW.order_id,
            v_order.warehouse_id,
            NEW.suggested_product_id,
            NEW.quantity,
            'reserved'
        )
        ON CONFLICT (order_id, product_id) WHERE status = 'reserved' DO UPDATE
        SET quantity = public.inventory_reservations.quantity + EXCLUDED.quantity;
        
        -- Release reservation for original item (if not already released by mark_item_oos)
        UPDATE public.inventory_reservations
        SET status = 'released', updated_at = now()
        WHERE order_id = NEW.order_id AND product_id = NEW.original_item_id AND status = 'reserved';
    END IF;

    -- If rejected, release nothing (original item might be OOS or partially picked, Picker handles it)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_substitution_approved ON public.order_substitutions;
CREATE TRIGGER trigger_substitution_approved
AFTER UPDATE ON public.order_substitutions
FOR EACH ROW EXECUTE FUNCTION handle_approved_substitution();
