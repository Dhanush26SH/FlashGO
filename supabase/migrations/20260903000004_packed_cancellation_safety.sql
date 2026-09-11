-- Migration 20260903000004_packed_cancellation_safety.sql

-- 1. Create the physical return-to-stock queue for packed/staged cancellations
CREATE TABLE IF NOT EXISTS public.order_unpack_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'restocked', 'damaged', 'quarantine')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(order_id)
);

ALTER TABLE public.order_unpack_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage unpack queue" ON public.order_unpack_queue FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse Managers manage unpack queue" ON public.order_unpack_queue FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_manager' AND warehouse_id = order_unpack_queue.warehouse_id)
);
CREATE POLICY "Warehouse Staff view unpack queue" ON public.order_unpack_queue FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_staff', 'picker') AND warehouse_id = order_unpack_queue.warehouse_id)
);

-- 2. Modify process_order_cancellation to isolate packed/staged physical safety
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
        
        -- If packed or staged, do NOT restore automatically. Push to unpack queue.
        IF OLD.status IN ('packed', 'staged') THEN
            INSERT INTO public.order_unpack_queue (order_id, warehouse_id, status)
            VALUES (NEW.id, NEW.warehouse_id, 'pending');
        
        -- If ONLY picking or waiting_for_packing, the stock is still on the trolley/floor loosely, restore immediately.
        ELSIF OLD.status IN ('picking', 'waiting_for_packing', 'packing') THEN
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

-- 3. Authoritative secure RPC to process the physical unpack and disposition
CREATE OR REPLACE FUNCTION process_order_unpack(
    p_unpack_id UUID,
    p_disposition TEXT, -- 'restocked', 'damaged', 'quarantine'
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_unpack RECORD;
    v_is_suspended BOOLEAN;
    v_valid_role BOOLEAN;
    v_ledger RECORD;
BEGIN
    SELECT COALESCE(is_suspended, FALSE), role IN ('admin', 'warehouse_manager')
    INTO v_is_suspended, v_valid_role
    FROM public.profiles WHERE id = p_user_id;

    IF NOT v_valid_role THEN RAISE EXCEPTION 'Unauthorized: User is not a manager or admin'; END IF;
    IF v_is_suspended THEN RAISE EXCEPTION 'Account is suspended.'; END IF;

    SELECT * INTO v_unpack FROM public.order_unpack_queue WHERE id = p_unpack_id FOR UPDATE;
    IF v_unpack.id IS NULL THEN RAISE EXCEPTION 'Unpack task not found'; END IF;
    IF v_unpack.status != 'pending' THEN RAISE EXCEPTION 'Unpack task already processed'; END IF;

    IF p_disposition NOT IN ('restocked', 'damaged', 'quarantine') THEN
        RAISE EXCEPTION 'Invalid disposition: %', p_disposition;
    END IF;

    UPDATE public.order_unpack_queue 
    SET status = p_disposition, processed_at = now(), processed_by = p_user_id
    WHERE id = p_unpack_id;

    -- Only RESTOCK returns quantity to sellable inventory
    IF p_disposition = 'restocked' THEN
        FOR v_ledger IN 
            SELECT product_id, order_item_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
            FROM public.stock_ledgers
            WHERE order_id = v_unpack.order_id AND reason IN ('picking', 'picking_undo')
            GROUP BY product_id, order_item_id, batch_id, warehouse_id
            HAVING SUM(quantity_change) < 0
        LOOP
            IF v_ledger.batch_id IS NOT NULL THEN
                UPDATE public.product_batches 
                SET available_quantity = available_quantity + ABS(v_ledger.net_picked)
                WHERE id = v_ledger.batch_id;
            END IF;

            UPDATE public.warehouse_stock 
            SET quantity = quantity + ABS(v_ledger.net_picked)
            WHERE warehouse_id = v_ledger.warehouse_id AND product_id = v_ledger.product_id;

            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
            )
            VALUES (
                v_ledger.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                ABS(v_ledger.net_picked), 'unpack_restock', v_unpack.order_id
            );
        END LOOP;
    ELSE
        -- For damaged/quarantine, we log that it was moved but not restocked
        FOR v_ledger IN 
            SELECT product_id, order_item_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
            FROM public.stock_ledgers
            WHERE order_id = v_unpack.order_id AND reason IN ('picking', 'picking_undo')
            GROUP BY product_id, order_item_id, batch_id, warehouse_id
            HAVING SUM(quantity_change) < 0
        LOOP
            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, order_item_id, batch_id, quantity_change, reason, order_id
            )
            VALUES (
                v_ledger.warehouse_id, v_ledger.product_id, v_ledger.order_item_id, v_ledger.batch_id, 
                0, 'unpack_' || p_disposition, v_unpack.order_id
            );
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
