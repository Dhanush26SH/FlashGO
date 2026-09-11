-- Migration 20260903000007_final_warehouse_gaps.sql

-- 1. CROSS-WAREHOUSE STOCK TRANSFER
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    destination_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES public.product_batches(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'dispatched', 'in_transit', 'received', 'completed', 'cancelled')),
    requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
    dispatched_quantity INTEGER,
    received_quantity INTEGER,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    dispatched_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    CONSTRAINT st_different_warehouses CHECK (source_warehouse_id != destination_warehouse_id)
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access transfers" ON public.stock_transfers FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Manager view own transfers" ON public.stock_transfers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_manager' AND (warehouse_id = source_warehouse_id OR warehouse_id = destination_warehouse_id))
);

-- Note: Mutations by managers are exclusively handled via SECURITY DEFINER RPCs to avoid split-brain manipulation.

CREATE OR REPLACE FUNCTION dispatch_stock_transfer(
    p_transfer_id UUID,
    p_quantity INTEGER,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_transfer RECORD;
    v_role TEXT;
    v_warehouse_id UUID;
    v_sellable INTEGER;
BEGIN
    SELECT role, warehouse_id INTO v_role, v_warehouse_id FROM public.profiles WHERE id = p_user_id AND is_suspended = false;
    IF v_role NOT IN ('admin', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
    IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.status NOT IN ('draft', 'approved') THEN RAISE EXCEPTION 'Cannot dispatch from status %', v_transfer.status; END IF;
    IF v_role = 'warehouse_manager' AND v_transfer.source_warehouse_id != v_warehouse_id THEN RAISE EXCEPTION 'Not authorized for source warehouse'; END IF;

    -- Validate inventory
    SELECT (quantity - COALESCE((SELECT SUM(quantity) FROM public.inventory_reservations WHERE product_id = v_transfer.product_id AND warehouse_id = v_transfer.source_warehouse_id), 0))
    INTO v_sellable
    FROM public.warehouse_stock WHERE product_id = v_transfer.product_id AND warehouse_id = v_transfer.source_warehouse_id;

    IF v_sellable < p_quantity THEN RAISE EXCEPTION 'Insufficient sellable stock'; END IF;

    -- Deduct source batch
    IF v_transfer.batch_id IS NOT NULL THEN
        UPDATE public.product_batches SET available_quantity = available_quantity - p_quantity WHERE id = v_transfer.batch_id;
    END IF;

    -- Deduct source warehouse stock
    UPDATE public.warehouse_stock SET quantity = quantity - p_quantity WHERE product_id = v_transfer.product_id AND warehouse_id = v_transfer.source_warehouse_id;

    -- Record ledger
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
    ) VALUES (
        v_transfer.source_warehouse_id, v_transfer.product_id, v_transfer.batch_id, -p_quantity, 'transfer_dispatch', p_user_id
    );

    UPDATE public.stock_transfers
    SET status = 'in_transit', dispatched_quantity = p_quantity, dispatched_by = p_user_id, dispatched_at = now()
    WHERE id = p_transfer_id;

    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details)
    VALUES (p_user_id, 'transfer_dispatched', 'stock_transfers', p_transfer_id, jsonb_build_object('quantity', p_quantity));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION receive_stock_transfer(
    p_transfer_id UUID,
    p_quantity INTEGER,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_transfer RECORD;
    v_role TEXT;
    v_warehouse_id UUID;
    v_batch RECORD;
    v_new_batch_id UUID;
BEGIN
    SELECT role, warehouse_id INTO v_role, v_warehouse_id FROM public.profiles WHERE id = p_user_id AND is_suspended = false;
    IF v_role NOT IN ('admin', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
    IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
    IF v_transfer.status != 'in_transit' THEN RAISE EXCEPTION 'Cannot receive from status %', v_transfer.status; END IF;
    IF v_role = 'warehouse_manager' AND v_transfer.destination_warehouse_id != v_warehouse_id THEN RAISE EXCEPTION 'Not authorized for destination warehouse'; END IF;

    -- If there's a batch, we must duplicate it for the destination warehouse
    IF v_transfer.batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM public.product_batches WHERE id = v_transfer.batch_id;
        INSERT INTO public.product_batches (
            product_id, warehouse_id, batch_number, expiry_date, initial_quantity, available_quantity, unit_cost
        ) VALUES (
            v_transfer.product_id, v_transfer.destination_warehouse_id, v_batch.batch_number, v_batch.expiry_date, p_quantity, p_quantity, v_batch.unit_cost
        ) RETURNING id INTO v_new_batch_id;
    END IF;

    -- Add to destination stock
    UPDATE public.warehouse_stock SET quantity = quantity + p_quantity WHERE product_id = v_transfer.product_id AND warehouse_id = v_transfer.destination_warehouse_id;

    -- Record ledger
    INSERT INTO public.stock_ledgers (
        warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
    ) VALUES (
        v_transfer.destination_warehouse_id, v_transfer.product_id, v_new_batch_id, p_quantity, 'transfer_receive', p_user_id
    );

    UPDATE public.stock_transfers
    SET status = 'completed', received_quantity = p_quantity, received_by = p_user_id, received_at = now()
    WHERE id = p_transfer_id;

    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details)
    VALUES (p_user_id, 'transfer_received', 'stock_transfers', p_transfer_id, jsonb_build_object('quantity', p_quantity));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. CUSTOMER RETURN → PHYSICAL DISPOSITION
-- We integrate the physical return trigger into `order_unpack_queue` via a Support action.
CREATE OR REPLACE FUNCTION trigger_physical_customer_return(
    p_ticket_id UUID,
    p_order_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id AND is_suspended = false;
    IF v_role NOT IN ('admin', 'support_ops', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- Check if it already exists to prevent duplicate insertion
    IF EXISTS (SELECT 1 FROM public.order_unpack_queue WHERE order_id = p_order_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Physical return task already pending for this order';
    END IF;

    INSERT INTO public.order_unpack_queue (
        order_id, warehouse_id, status
    ) VALUES (
        p_order_id, p_warehouse_id, 'pending'
    );

    INSERT INTO public.admin_audit_logs (admin_id, action, entity, entity_id, details)
    VALUES (p_user_id, 'customer_return_created', 'support_tickets', p_ticket_id, jsonb_build_object('order_id', p_order_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
