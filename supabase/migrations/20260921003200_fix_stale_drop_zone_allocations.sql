-- Migration: 20260921003200_fix_stale_drop_zone_allocations.sql
-- Description: Safely void stale drop zone allocations when an order is cancelled

-- 1. Modify process_order_cancellation to include Drop Zone cleanup
CREATE OR REPLACE FUNCTION public.process_order_cancellation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ledger RECORD;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        IF OLD.status = 'delivered' THEN
            RAISE EXCEPTION 'Cannot cancel a delivered order. Use return/refund workflow instead.';
        END IF;

        IF OLD.status IN ('handed_off', 'out_for_delivery') THEN
            NULL;
        ELSIF OLD.status IN ('placed', 'picking') THEN
            PERFORM release_order_reservations(NEW.id);
        END IF;
        
        -- Any order that started picking goes to the unpack queue to be physically returned to a shelf
        IF OLD.status IN ('picking', 'waiting_for_packing', 'packing', 'packed', 'staged') THEN
            -- Check if any physical picking occurred
            PERFORM 1 FROM public.stock_ledgers WHERE order_id = NEW.id AND reason IN ('picking', 'picking_undo');
            IF FOUND THEN
                INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status)
                VALUES (NEW.id, NEW.warehouse_id, 'pending');
            END IF;
        END IF;

        IF OLD.payment_status = 'paid' THEN
            NEW.payment_status := 'refunded';
            IF OLD.payment_method = 'wallet' THEN
                UPDATE public.profiles SET wallet_balance = wallet_balance + OLD.total_amount WHERE id = OLD.customer_id;
                INSERT INTO public.wallet_transactions (user_id, amount, type, description)
                VALUES (OLD.customer_id, OLD.total_amount, 'credit', 'Refund for Order ' || OLD.id);
            END IF;
        END IF;

        -- [NEW] Drop Zone Allocation Lifecycle Cleanup
        -- Ensures active allocations (allocated, placed, driver_assigned) 
        -- transition to the terminal 'voided' state.
        -- 'picked_up' is omitted because it is already terminal.
        UPDATE public.drop_zone_allocations 
        SET status = 'voided' 
        WHERE order_id = NEW.id 
          AND status IN ('allocated', 'placed', 'driver_assigned');

    END IF;
    RETURN NEW;
END;
$$;

-- 2. Repair existing known stale allocations with safety guards
DO $$
DECLARE
    v_order_status1 TEXT;
    v_order_status2 TEXT;
BEGIN
    -- Repair Allocation 1 (G1, bf8c40c9-62b1-44e4-b7a1-5537c61ec4bf)
    SELECT status INTO v_order_status1 FROM public.orders WHERE id = '2c4136ae-cf5f-4043-a991-e1c14fd8b159';
    IF v_order_status1 = 'cancelled' THEN
        UPDATE public.drop_zone_allocations 
        SET status = 'voided'
        WHERE id = 'bf8c40c9-62b1-44e4-b7a1-5537c61ec4bf' 
          AND status IN ('allocated', 'placed', 'driver_assigned');
    END IF;

    -- Repair Allocation 2 (G2, f1aca8c5-15ff-423a-8105-c332bc1346ac)
    SELECT status INTO v_order_status2 FROM public.orders WHERE id = '709781b5-a9c7-4d76-8709-d8b4be9f67f7';
    IF v_order_status2 = 'cancelled' THEN
        UPDATE public.drop_zone_allocations 
        SET status = 'voided'
        WHERE id = 'f1aca8c5-15ff-423a-8105-c332bc1346ac' 
          AND status IN ('allocated', 'placed', 'driver_assigned');
    END IF;
END $$;
