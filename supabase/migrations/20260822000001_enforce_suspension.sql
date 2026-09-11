-- Migration: 20260822000001_enforce_suspension.sql
-- Purpose: Enforce is_suspended flag at the database/RPC layer.
-- Covers:
--   1. RLS: Prevent suspended Customers from inserting orders and support tickets.
--   2. claim_trip: Prevent suspended Drivers from claiming trips.
--   3. start_trip: Prevent suspended Drivers from starting trips.
--   4. pick_fefo_item: Prevent suspended Pickers from picking.
--   5. process_wallet_transaction: Prevent suspended users from crediting/debiting their wallet.

-- ─────────────────────────────────────────────────────────────
-- 1. Orders INSERT — block suspended customers
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = customer_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (is_suspended IS NULL OR is_suspended = FALSE)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Support tickets INSERT — block suspended customers
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Customers can create support tickets" ON public.support_tickets;
CREATE POLICY "Customers can create support tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (
    auth.uid() = customer_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (is_suspended IS NULL OR is_suspended = FALSE)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. claim_trip — add suspension guard to existing RPC
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
BEGIN
    -- Lock driver to serialize assignments
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_driver_role, v_is_online, v_is_suspended
    FROM public.profiles
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;

    -- SUSPENSION CHECK
    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account % is suspended. Cannot claim trips.', p_driver_id;
    END IF;

    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver % is not online', p_driver_id;
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit') AND id != p_trip_id
    ) THEN
        RAISE EXCEPTION 'Driver % already has an active trip', p_driver_id;
    END IF;

    -- Lock trip
    SELECT status INTO v_trip_status
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip_status IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or in transit';
    END IF;

    -- Update trip (DO NOT update order status to out_for_delivery)
    UPDATE public.logistics_trips
    SET driver_id = p_driver_id,
        status = 'accepted',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Sync order driver_id only
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- 4. start_trip — add suspension guard to existing RPC
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION start_trip(
    p_trip_id UUID,
    p_driver_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_trip RECORD;
    v_is_suspended BOOLEAN;
BEGIN
    -- SUSPENSION CHECK
    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_driver_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account % is suspended. Cannot start trips.', p_driver_id;
    END IF;

    -- Lock trip
    SELECT * INTO v_trip
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip.id IS NULL THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.driver_id != p_driver_id THEN
        RAISE EXCEPTION 'Trip does not belong to this driver';
    END IF;

    IF v_trip.status != 'accepted' THEN
        RAISE EXCEPTION 'Trip must be in accepted status to start';
    END IF;

    -- Update trip status
    UPDATE public.logistics_trips
    SET status = 'in_transit',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_trip_id;

    -- Set associated non-cancelled orders to out_for_delivery
    UPDATE public.orders
    SET status = 'out_for_delivery',
        updated_at = timezone('utc'::text, now())
    WHERE trip_id = p_trip_id AND status != 'cancelled';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- 5. pick_fefo_item — add suspension guard (matches actual signature)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pick_fefo_item(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_remaining_qty INTEGER := p_quantity;
    v_batch RECORD;
    v_take_qty INTEGER;
    v_consumed_batches JSONB := '[]'::JSONB;
    v_total_stock INTEGER;
    v_is_suspended BOOLEAN;
BEGIN
    -- 1. Validate permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND role IN ('picker', 'admin', 'warehouse_staff')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User % is not a valid picker/admin', p_user_id;
    END IF;

    -- SUSPENSION CHECK
    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_user_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account % is suspended. Cannot perform picking operations.', p_user_id;
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- 2. Verify and lock total stock first to prevent concurrent aggregate modification deadlocks
    SELECT quantity INTO v_total_stock
    FROM public.warehouse_stock
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id FOR UPDATE;

    IF v_total_stock IS NULL OR v_total_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient total stock in warehouse % for product %', p_warehouse_id, p_product_id;
    END IF;

    -- 3. Lock and iterate through active batches using FEFO
    FOR v_batch IN
        SELECT id, batch_number, expiry_date, available_quantity
        FROM public.product_batches
        WHERE warehouse_id = p_warehouse_id
          AND product_id = p_product_id
          AND status = 'active'
          AND available_quantity > 0
          AND expiry_date >= CURRENT_DATE
        ORDER BY expiry_date ASC, created_at ASC, id ASC
        FOR UPDATE
    LOOP
        IF v_remaining_qty <= 0 THEN
            EXIT; -- We have fulfilled the pick
        END IF;

        -- Calculate how much to take from this batch
        IF v_batch.available_quantity >= v_remaining_qty THEN
            v_take_qty := v_remaining_qty;
        ELSE
            v_take_qty := v_batch.available_quantity;
        END IF;

        -- Consume from batch
        UPDATE public.product_batches
        SET available_quantity = available_quantity - v_take_qty,
            status = CASE WHEN available_quantity - v_take_qty = 0 THEN 'depleted' ELSE 'active' END
        WHERE id = v_batch.id;

        -- Record ledger
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id)
        VALUES (p_warehouse_id, p_product_id, -v_take_qty, 'picking', p_user_id, v_batch.id);

        -- Add to return value
        v_consumed_batches := v_consumed_batches || jsonb_build_object(
            'batch_id', v_batch.id,
            'batch_number', v_batch.batch_number,
            'quantity_consumed', v_take_qty,
            'expiry_date', v_batch.expiry_date
        );

        v_remaining_qty := v_remaining_qty - v_take_qty;
    END LOOP;

    -- 4. Check if we fulfilled the request
    IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Insufficient active/unexpired batch stock. Need % more units.', v_remaining_qty;
    END IF;

    -- 5. Update aggregate warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    RETURN v_consumed_batches;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- 6. process_wallet_transaction — block suspended users from
--    crediting/debiting their own wallet via RPC
--    (Admin-initiated adjustments are exempt since admin
--     role is checked separately)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_wallet_transaction(
    p_user_id UUID,
    p_amount DECIMAL,
    p_tx_type tx_type,
    p_description TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_balance DECIMAL;
    v_caller_role TEXT;
    v_is_suspended BOOLEAN;
BEGIN
    -- Fetch caller role
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

    -- If the caller is the user themselves (not admin), enforce suspension
    IF auth.uid() = p_user_id THEN
        SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
        FROM public.profiles WHERE id = p_user_id;

        IF v_is_suspended = TRUE THEN
            RAISE EXCEPTION 'Account % is suspended. Wallet operations are blocked.', p_user_id;
        END IF;
    END IF;

    -- Lock the row for update
    SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    IF p_tx_type = 'debit' AND v_current_balance < p_amount THEN
        RETURN FALSE; -- Insufficient funds
    END IF;

    -- Update balance
    IF p_tx_type = 'credit' THEN
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
    ELSE
        UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount WHERE id = p_user_id;
    END IF;

    -- Insert transaction record
    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_amount, p_tx_type, p_description);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
