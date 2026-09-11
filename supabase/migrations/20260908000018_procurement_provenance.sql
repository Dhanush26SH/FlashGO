-- 20260908000018_procurement_provenance.sql

-- 1. Create Goods Receipts Tables
CREATE TABLE IF NOT EXISTS public.goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT NOT NULL UNIQUE,
    procurement_order_id UUID REFERENCES public.procurement_orders(id) ON DELETE CASCADE NOT NULL,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read goods_receipts" ON public.goods_receipts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse staff read goods_receipts" ON public.goods_receipts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_manager', 'warehouse_staff', 'picker') AND warehouse_id = goods_receipts.warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE CASCADE NOT NULL,
    procurement_order_item_id UUID REFERENCES public.procurement_order_items(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
    accepted_quantity INTEGER NOT NULL CHECK (accepted_quantity >= 0),
    rejected_quantity INTEGER NOT NULL CHECK (rejected_quantity >= 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    batch_number TEXT,
    expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT grn_qty_check CHECK (quantity_received = accepted_quantity + rejected_quantity)
);

ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read goods_receipt_items" ON public.goods_receipt_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse staff read goods_receipt_items" ON public.goods_receipt_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_manager', 'warehouse_staff', 'picker') AND warehouse_id = (SELECT warehouse_id FROM public.goods_receipts WHERE id = goods_receipt_items.receipt_id))
);

-- 2. Alter existing tables
ALTER TABLE public.product_batches ADD COLUMN IF NOT EXISTS goods_receipt_item_id UUID REFERENCES public.goods_receipt_items(id) ON DELETE SET NULL;
ALTER TABLE public.procurement_order_items ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0 NOT NULL;

-- Ensure constraint allows 'partially_received'
-- No constraint exists natively on procurement_orders.status, but just in case:
-- We'll just rely on logic.

-- 3. Secure Receiving RPC with Idempotency
-- Drop the existing one to replace it
DROP FUNCTION IF EXISTS public.receive_procurement_order(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.receive_procurement_order(UUID, UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID,
    p_receipt_number TEXT,
    p_notes TEXT,
    p_items JSONB -- [{ procurement_order_item_id, product_id, accepted_quantity, rejected_quantity, batch_number, expiry_date, unit_cost }]
) RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_user_role TEXT;
    v_user_warehouse UUID;
    v_user_suspended BOOLEAN;
    v_item JSONB;
    v_po_item RECORD;
    v_receipt_id UUID;
    v_grn_item_id UUID;
    v_batch_id UUID;
    v_total_accepted INTEGER;
    v_all_received BOOLEAN := TRUE;
    v_any_received BOOLEAN := FALSE;
    v_status TEXT;
BEGIN
    -- 1. Check idempotency
    SELECT id INTO v_receipt_id FROM public.goods_receipts WHERE receipt_number = p_receipt_number;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'message', 'Receipt already processed (idempotent)', 'receipt_id', v_receipt_id);
    END IF;

    -- 2. Validate Caller
    SELECT role, warehouse_id, is_suspended INTO v_user_role, v_user_warehouse, v_user_suspended
    FROM public.profiles WHERE id = p_user_id;

    IF v_user_suspended = TRUE THEN RAISE EXCEPTION 'Unauthorized: Account is suspended'; END IF;
    IF v_user_role NOT IN ('admin', 'warehouse_manager', 'warehouse_staff') THEN RAISE EXCEPTION 'Unauthorized: Invalid role'; END IF;

    -- 3. Lock PO
    SELECT * INTO v_order FROM public.procurement_orders WHERE id = p_procurement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Procurement order not found'; END IF;
    IF v_order.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'Cannot receive a PO that is %', v_order.status; END IF;
    IF v_order.warehouse_id != p_warehouse_id THEN RAISE EXCEPTION 'Warehouse mismatch on PO'; END IF;

    -- 4. Cross-warehouse validation
    IF v_user_role != 'admin' AND v_user_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cross-warehouse receiving blocked';
    END IF;

    -- 5. Create GRN
    INSERT INTO public.goods_receipts (receipt_number, procurement_order_id, vendor_id, warehouse_id, received_by, notes)
    VALUES (p_receipt_number, p_procurement_id, v_order.vendor_id, p_warehouse_id, p_user_id, p_notes)
    RETURNING id INTO v_receipt_id;

    -- 6. Process items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF (v_item->>'accepted_quantity')::INTEGER < 0 OR (v_item->>'rejected_quantity')::INTEGER < 0 THEN
            RAISE EXCEPTION 'Negative quantities not allowed';
        END IF;

        IF (v_item->>'accepted_quantity')::INTEGER = 0 AND (v_item->>'rejected_quantity')::INTEGER = 0 THEN
            CONTINUE; -- Skip empty lines
        END IF;

        -- Lock PO Item
        SELECT * INTO v_po_item FROM public.procurement_order_items 
        WHERE id = (v_item->>'procurement_order_item_id')::UUID 
          AND procurement_order_id = p_procurement_id FOR UPDATE;
          
        IF NOT FOUND THEN RAISE EXCEPTION 'PO Item % not found', v_item->>'procurement_order_item_id'; END IF;

        IF v_po_item.received_quantity + (v_item->>'accepted_quantity')::INTEGER + (v_item->>'rejected_quantity')::INTEGER > v_po_item.quantity THEN
            RAISE EXCEPTION 'Over-receipt detected for product %', v_po_item.product_id;
        END IF;

        v_any_received := TRUE;

        -- Create GRN Item
        INSERT INTO public.goods_receipt_items (
            receipt_id, procurement_order_item_id, product_id, 
            quantity_received, accepted_quantity, rejected_quantity, 
            unit_cost, batch_number, expiry_date
        ) VALUES (
            v_receipt_id, v_po_item.id, v_po_item.product_id,
            (v_item->>'accepted_quantity')::INTEGER + (v_item->>'rejected_quantity')::INTEGER,
            (v_item->>'accepted_quantity')::INTEGER,
            (v_item->>'rejected_quantity')::INTEGER,
            (v_item->>'unit_cost')::NUMERIC,
            v_item->>'batch_number',
            (v_item->>'expiry_date')::DATE
        ) RETURNING id INTO v_grn_item_id;

        -- Update PO item
        UPDATE public.procurement_order_items
        SET received_quantity = received_quantity + (v_item->>'accepted_quantity')::INTEGER + (v_item->>'rejected_quantity')::INTEGER
        WHERE id = v_po_item.id;

        -- Accepted stock accounting
        IF (v_item->>'accepted_quantity')::INTEGER > 0 THEN
            -- 1. Create product batch with provenance
            INSERT INTO public.product_batches (
                product_id, warehouse_id, batch_number, expiry_date, 
                received_quantity, available_quantity, status, goods_receipt_item_id
            ) VALUES (
                v_po_item.product_id, p_warehouse_id, v_item->>'batch_number', (v_item->>'expiry_date')::DATE,
                (v_item->>'accepted_quantity')::INTEGER, (v_item->>'accepted_quantity')::INTEGER, 'active', v_grn_item_id
            ) RETURNING id INTO v_batch_id;

            -- 2. Increment warehouse stock
            UPDATE public.warehouse_stock
            SET quantity = quantity + (v_item->>'accepted_quantity')::INTEGER
            WHERE product_id = v_po_item.product_id AND warehouse_id = p_warehouse_id;

            -- 3. Write stock ledger
            INSERT INTO public.stock_ledgers (
                warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
            ) VALUES (
                p_warehouse_id, v_po_item.product_id, v_batch_id, (v_item->>'accepted_quantity')::INTEGER, 'grn', p_user_id
            );
            
            -- Add to putaway tasks
            INSERT INTO public.putaway_tasks (warehouse_id, product_id, batch_id, quantity, source_type)
            VALUES (p_warehouse_id, v_po_item.product_id, v_batch_id, (v_item->>'accepted_quantity')::INTEGER, 'grn');
        END IF;
    END LOOP;

    IF NOT v_any_received THEN
        RAISE EXCEPTION 'No items received';
    END IF;

    -- Evaluate PO Status
    SELECT bool_and(received_quantity >= quantity) INTO v_all_received
    FROM public.procurement_order_items WHERE procurement_order_id = p_procurement_id;

    IF v_all_received THEN
        v_status := 'received';
    ELSE
        v_status := 'partially_received';
    END IF;

    UPDATE public.procurement_orders SET status = v_status WHERE id = p_procurement_id;

    RETURN jsonb_build_object('success', true, 'receipt_id', v_receipt_id, 'new_status', v_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
