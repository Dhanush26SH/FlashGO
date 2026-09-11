-- Migration 20260903000001_p0_warehouse_operations.sql


-- 2. New Table: Staging Locations
CREATE TABLE IF NOT EXISTS public.warehouse_staging_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(warehouse_id, name)
);
ALTER TABLE public.warehouse_staging_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can manage staging locations" ON public.warehouse_staging_locations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse Managers can read staging locations" ON public.warehouse_staging_locations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'warehouse_manager' AND warehouse_id = warehouse_staging_locations.warehouse_id)
);
CREATE POLICY "Warehouse Staff can read staging locations" ON public.warehouse_staging_locations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff' AND warehouse_id = warehouse_staging_locations.warehouse_id)
);
CREATE POLICY "Warehouse Managers update staging locations" ON public.warehouse_staging_locations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'warehouse_manager' AND warehouse_id = warehouse_staging_locations.warehouse_id)
);

-- 3. New Table: Order Packing Operations (1:1 with Order)
CREATE TABLE IF NOT EXISTS public.order_packing_operations (
    order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    packer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    packing_started_at TIMESTAMP WITH TIME ZONE,
    packed_at TIMESTAMP WITH TIME ZONE,
    bag_number TEXT,
    staging_location_id UUID REFERENCES public.warehouse_staging_locations(id) ON DELETE SET NULL,
    staged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    staged_at TIMESTAMP WITH TIME ZONE,
    handed_off_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    handed_off_at TIMESTAMP WITH TIME ZONE,
    trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.order_packing_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins access order packing" ON public.order_packing_operations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse Managers access order packing" ON public.order_packing_operations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_manager' AND warehouse_id = order_packing_operations.warehouse_id)
);
CREATE POLICY "Warehouse Staff access order packing" ON public.order_packing_operations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_staff', 'picker') AND warehouse_id = order_packing_operations.warehouse_id)
);

-- 4. Update order_packing RPC (replace old pack_order logic)
CREATE OR REPLACE FUNCTION start_packing_order(
    p_order_id UUID,
    p_packer_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_warehouse_id, v_is_suspended
    FROM public.profiles WHERE id = p_packer_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff');

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not a valid warehouse staff/manager';
    END IF;
    IF v_is_suspended THEN
        RAISE EXCEPTION 'Account is suspended.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order.status = 'packing' THEN RETURN; END IF;
    IF v_order.status != 'waiting_for_packing' THEN
        RAISE EXCEPTION 'Order is not waiting for packing (status: %)', v_order.status;
    END IF;

    UPDATE public.orders SET status = 'packing', updated_at = now() WHERE id = p_order_id;
    
    INSERT INTO public.order_packing_operations (order_id, warehouse_id, packer_id, packing_started_at)
    VALUES (p_order_id, v_order.warehouse_id, p_packer_id, now())
    ON CONFLICT (order_id) DO UPDATE SET packer_id = EXCLUDED.packer_id, packing_started_at = EXCLUDED.packing_started_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Overwrite existing pack_order
CREATE OR REPLACE FUNCTION pack_order(
    p_order_id UUID,
    p_picker_id UUID,
    p_bag_number TEXT
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_item RECORD;
    v_picked_qty INTEGER;
    v_sub_picked_qty INTEGER;
    v_warehouse_id UUID;
BEGIN
    -- This handles packing completion.
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_warehouse_id, v_is_suspended
    FROM public.profiles WHERE id = p_picker_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff');

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not a valid warehouse staff/manager';
    END IF;
    IF v_is_suspended THEN
        RAISE EXCEPTION 'Account is suspended.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.status = 'packed' THEN RETURN; END IF;
    IF v_order.status NOT IN ('picking', 'waiting_for_packing', 'packing') THEN
        RAISE EXCEPTION 'Order cannot be packed from status: %', v_order.status;
    END IF;

    IF TRIM(COALESCE(p_bag_number, '')) = '' THEN
        RAISE EXCEPTION 'Bag number is mandatory to pack an order';
    END IF;

    -- Verify all items picked
    FOR v_item IN 
        SELECT id, product_id, quantity, status
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        SELECT ABS(COALESCE(SUM(quantity_change), 0)) INTO v_picked_qty
        FROM public.stock_ledgers
        WHERE order_id = p_order_id 
          AND product_id = v_item.product_id 
          AND reason IN ('picking', 'picking_undo');

        IF v_picked_qty < v_item.quantity THEN
            SELECT ABS(COALESCE(SUM(sl.quantity_change), 0)) INTO v_sub_picked_qty
            FROM public.order_substitutions os
            JOIN public.stock_ledgers sl ON sl.order_id = os.order_id AND sl.product_id = os.suggested_product_id
            WHERE os.order_id = p_order_id
              AND os.original_item_id = v_item.product_id
              AND os.status = 'approved'
              AND sl.reason IN ('picking', 'picking_undo');

            IF (v_picked_qty + v_sub_picked_qty) < v_item.quantity THEN
                IF v_item.status != 'out_of_stock' THEN
                    RAISE EXCEPTION 'Order item % is not fully picked and not marked out_of_stock', v_item.product_id;
                END IF;
            END IF;
        END IF;
    END LOOP;

    UPDATE public.orders 
    SET status = 'packed', bag_number = TRIM(p_bag_number), updated_at = now()
    WHERE id = p_order_id;
    
    INSERT INTO public.order_packing_operations (order_id, warehouse_id, packer_id, bag_number, packed_at)
    VALUES (p_order_id, v_order.warehouse_id, p_picker_id, TRIM(p_bag_number), now())
    ON CONFLICT (order_id) DO UPDATE SET 
        packer_id = EXCLUDED.packer_id, 
        bag_number = EXCLUDED.bag_number, 
        packed_at = EXCLUDED.packed_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Staging and Handoff RPCs
CREATE OR REPLACE FUNCTION stage_order(
    p_order_id UUID,
    p_location_id UUID,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_loc RECORD;
    v_is_suspended BOOLEAN;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_warehouse_id, v_is_suspended
    FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff');

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_is_suspended THEN RAISE EXCEPTION 'Account suspended'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.status = 'staged' THEN RETURN; END IF;
    IF v_order.status != 'packed' THEN
        RAISE EXCEPTION 'Order must be packed to be staged';
    END IF;
    IF v_order.warehouse_id != v_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Cross-warehouse staging not permitted';
    END IF;

    SELECT * INTO v_loc FROM public.warehouse_staging_locations WHERE id = p_location_id AND active = true;
    IF v_loc.id IS NULL OR v_loc.warehouse_id != v_order.warehouse_id THEN
        RAISE EXCEPTION 'Invalid staging location';
    END IF;

    UPDATE public.orders SET status = 'staged', updated_at = now() WHERE id = p_order_id;
    
    UPDATE public.order_packing_operations 
    SET staging_location_id = p_location_id, staged_by = p_user_id, staged_at = now()
    WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION handoff_order(
    p_order_id UUID,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_trip RECORD;
    v_is_suspended BOOLEAN;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id, COALESCE(is_suspended, FALSE) INTO v_warehouse_id, v_is_suspended
    FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff');

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_is_suspended THEN RAISE EXCEPTION 'Account suspended'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.status IN ('handed_off', 'out_for_delivery', 'delivered') THEN RETURN; END IF;
    IF v_order.status != 'staged' THEN
        RAISE EXCEPTION 'Order must be staged to be handed off';
    END IF;

    -- Verify trip/driver assignment
    SELECT * INTO v_trip FROM public.logistics_trips WHERE order_id = p_order_id;
    IF v_trip.id IS NULL OR v_trip.driver_id IS NULL THEN
        RAISE EXCEPTION 'Order is not assigned to a driver/trip';
    END IF;

    UPDATE public.orders SET status = 'handed_off', updated_at = now() WHERE id = p_order_id;
    
    UPDATE public.order_packing_operations 
    SET handed_off_by = p_user_id, handed_off_at = now(), trip_id = v_trip.id, driver_id = v_trip.driver_id
    WHERE order_id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Safe Cancellation Override (Physical Provenance Restoration)
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
            -- We do NOT restore reservations or physical stock here. Must go through return-to-store.
            NULL;
        ELSIF OLD.status IN ('placed', 'picking') THEN
            -- Release reservations if before physical completion (if picking, they might have picked some, handled below)
            PERFORM release_order_reservations(NEW.id);
        END IF;
        
        -- If it was partially or fully picked, but still physically in warehouse, restore the stock EXACTLY using ledger provenance
        IF OLD.status IN ('picking', 'waiting_for_packing', 'packing', 'packed', 'staged') THEN
            FOR v_ledger IN 
                SELECT product_id, batch_id, warehouse_id, SUM(quantity_change) as net_picked
                FROM public.stock_ledgers
                WHERE order_id = NEW.id AND reason IN ('picking', 'picking_undo')
                GROUP BY product_id, batch_id, warehouse_id
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

                -- Record restoration ledger
                INSERT INTO public.stock_ledgers (warehouse_id, product_id, batch_id, quantity_change, reason, order_id)
                VALUES (v_ledger.warehouse_id, v_ledger.product_id, v_ledger.batch_id, ABS(v_ledger.net_picked), 'cancellation_restoration', NEW.id);
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
