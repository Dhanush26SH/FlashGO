-- Migration 20260903000002_fix_cancellation_provenance.sql

-- 1. Add order_item_id to stock_ledgers to establish exact item-level provenance
ALTER TABLE public.stock_ledgers 
ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;

-- 2. Create index for fast provenance lookups during cancellation
CREATE INDEX IF NOT EXISTS idx_stock_ledgers_provenance 
ON public.stock_ledgers(order_id, order_item_id, batch_id)
WHERE reason IN ('picking', 'picking_undo');

-- 3. Modify process_order_cancellation to use order_item_id for structured restoration
CREATE OR REPLACE FUNCTION process_order_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger RECORD;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        -- Delivered orders cannot be cancelled
        IF OLD.status = 'delivered' THEN
            RAISE EXCEPTION 'Cannot cancel a delivered order. Use return/refund workflow instead.';
        END IF;

        -- Handed off / Out for delivery: Cancel allowed but DO NOT restore stock silently.
        IF OLD.status IN ('handed_off', 'out_for_delivery') THEN
            NULL;
        ELSIF OLD.status IN ('placed', 'picking') THEN
            -- Release reservations if before physical completion
            PERFORM release_order_reservations(NEW.id);
        END IF;
        
        -- Restore exact batch quantities for physically retained items
        IF OLD.status IN ('picking', 'waiting_for_packing', 'packing', 'packed', 'staged') THEN
            FOR v_ledger IN 
                SELECT product_id, order_item_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
                FROM public.stock_ledgers
                WHERE order_id = NEW.id AND reason IN ('picking', 'picking_undo')
                GROUP BY product_id, order_item_id, batch_id, warehouse_id
                HAVING SUM(quantity_change) < 0
            LOOP
                -- Restore batch
                IF v_ledger.batch_id IS NOT NULL THEN
                    UPDATE public.product_batches 
                    SET available_quantity = available_quantity + ABS(v_ledger.net_picked)
                    WHERE id = v_ledger.batch_id;
                END IF;

                -- Restore aggregate
                UPDATE public.warehouse_stock 
                SET quantity = quantity + ABS(v_ledger.net_picked)
                WHERE warehouse_id = v_ledger.warehouse_id AND product_id = v_ledger.product_id;

                -- Record structured restoration ledger
                INSERT INTO public.stock_ledgers (
                    warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
                )
                VALUES (
                    v_ledger.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                    ABS(v_ledger.net_picked), 'cancellation_restoration', NEW.id
                );
            END LOOP;
        END IF;

        -- Reverse payment if paid
        IF OLD.payment_status = 'paid' THEN
            NEW.payment_status := 'refunded';
            IF OLD.payment_method = 'wallet' THEN
                UPDATE public.profiles SET wallet_balance = wallet_balance + OLD.total_amount WHERE id = OLD.customer_id;
                INSERT INTO public.wallet_transactions (user_id, amount, type, description)
                VALUES (OLD.customer_id, OLD.total_amount, 'credit', 'Refund for Order ' || OLD.id);
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
