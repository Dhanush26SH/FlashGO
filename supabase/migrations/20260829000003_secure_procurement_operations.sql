-- Phase 19.4: Secure B2B Procurement Lifecycle

-- 1. Secure Vendor Creation
CREATE OR REPLACE FUNCTION public.admin_create_vendor(
    p_name TEXT,
    p_email TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL
)
RETURNS public.vendors
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor public.vendors;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can register vendors';
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Vendor name is required';
    END IF;
    
    INSERT INTO public.vendors (name, email, contact_person, phone, address)
    VALUES (trim(p_name), trim(p_email), p_contact_person, p_phone, p_address)
    RETURNING * INTO v_vendor;

    RETURN v_vendor;
END;
$$;

-- 2. Secure PO Creation
CREATE OR REPLACE FUNCTION public.admin_create_po(
    p_vendor_id UUID,
    p_warehouse_id UUID,
    p_items JSONB
)
RETURNS public.procurement_orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_po public.procurement_orders;
    v_total_cost DECIMAL(12,2) := 0;
    item RECORD;
    v_product_id UUID;
    v_qty INTEGER;
    v_cost DECIMAL(12,2);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can create procurement orders';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Invalid vendor';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Invalid warehouse';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Procurement order must have at least one item';
    END IF;

    -- Calculate total cost and validate items
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item.value->>'product_id')::UUID;
        v_qty := (item.value->>'quantity')::INTEGER;
        v_cost := (item.value->>'cost_per_unit')::DECIMAL(12,2);

        IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id) THEN
            RAISE EXCEPTION 'Invalid product in order: %', v_product_id;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be positive';
        END IF;

        IF v_cost < 0 THEN
            RAISE EXCEPTION 'Unit cost cannot be negative';
        END IF;

        v_total_cost := v_total_cost + (v_qty * v_cost);
    END LOOP;

    -- Create PO
    INSERT INTO public.procurement_orders (vendor_id, warehouse_id, status, total_cost)
    VALUES (p_vendor_id, p_warehouse_id, 'pending', v_total_cost)
    RETURNING * INTO v_po;

    -- Insert items
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item.value->>'product_id')::UUID;
        v_qty := (item.value->>'quantity')::INTEGER;
        v_cost := (item.value->>'cost_per_unit')::DECIMAL(12,2);
        
        -- Insert with upsert behavior to normalize duplicates from frontend array
        INSERT INTO public.procurement_order_items (procurement_order_id, product_id, quantity, cost_per_unit)
        VALUES (v_po.id, v_product_id, v_qty, v_cost)
        ON CONFLICT (procurement_order_id, product_id)
        DO UPDATE SET quantity = public.procurement_order_items.quantity + EXCLUDED.quantity;
    END LOOP;

    RETURN v_po;
END;
$$;

-- 3. Secure PO Lifecycle
CREATE OR REPLACE FUNCTION public.admin_update_po_status(
    p_po_id UUID,
    p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update PO status';
    END IF;

    IF p_new_status NOT IN ('approved', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition: %', p_new_status;
    END IF;

    SELECT status INTO v_old_status FROM public.procurement_orders WHERE id = p_po_id FOR UPDATE;

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'PO not found';
    END IF;

    IF v_old_status = 'delivered' THEN
        RAISE EXCEPTION 'Cannot modify a delivered PO';
    END IF;
    
    IF v_old_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot modify a cancelled PO';
    END IF;

    IF p_new_status = 'approved' AND v_old_status != 'pending' THEN
        RAISE EXCEPTION 'Only pending POs can be approved';
    END IF;

    UPDATE public.procurement_orders SET status = p_new_status WHERE id = p_po_id;
    RETURN TRUE;
END;
$$;

-- 4. Corrected Idempotent Receiving RPC
CREATE OR REPLACE FUNCTION public.receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID,
    p_batches JSONB DEFAULT '[]'::jsonb
) RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_target_warehouse UUID;
    v_role TEXT;
    v_is_suspended BOOLEAN;
    v_user_warehouse UUID;
    item RECORD;
    v_batch_json JSONB;
    v_batch_id UUID;
    v_batch_number TEXT;
    v_expiry_date DATE;
    v_recv_qty INTEGER;
BEGIN
    -- Auth check
    SELECT role, is_suspended, warehouse_id INTO v_role, v_is_suspended, v_user_warehouse
    FROM public.profiles WHERE id = p_user_id;

    IF v_role NOT IN ('admin', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized: Only admin or warehouse staff can receive orders';
    END IF;

    IF v_is_suspended THEN
        RAISE EXCEPTION 'Unauthorized: Staff member is suspended';
    END IF;

    IF v_role = 'warehouse_staff' AND v_user_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Warehouse staff can only receive at their assigned warehouse';
    END IF;

    -- Lock the procurement order
    SELECT status, warehouse_id INTO v_status, v_target_warehouse 
    FROM public.procurement_orders 
    WHERE id = p_procurement_id FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'PO not found';
    END IF;

    IF v_status != 'approved' THEN
        RAISE EXCEPTION 'PO is not approved for receiving (Current status: %)', v_status;
    END IF;

    IF v_target_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Wrong warehouse: PO belongs to a different warehouse';
    END IF;

    -- Loop through items and atomically update stock
    FOR item IN SELECT product_id, quantity FROM public.procurement_order_items WHERE procurement_order_id = p_procurement_id
    LOOP
        -- Find the batch entry
        SELECT * INTO v_batch_json 
        FROM jsonb_array_elements(p_batches) AS b 
        WHERE (b->>'product_id')::UUID = item.product_id 
        LIMIT 1;
        
        IF v_batch_json IS NULL THEN
            RAISE EXCEPTION 'Batch details missing for product %', item.product_id;
        END IF;

        v_batch_number := v_batch_json->>'batch_number';
        v_expiry_date := (v_batch_json->>'expiry_date')::DATE;
        v_recv_qty := (v_batch_json->>'received_quantity')::INTEGER;
        
        IF v_recv_qty <= 0 THEN
            RAISE EXCEPTION 'Received quantity must be positive';
        END IF;

        IF v_recv_qty > item.quantity THEN
            RAISE EXCEPTION 'Received quantity (%) cannot exceed PO quantity (%) for product %', v_recv_qty, item.quantity, item.product_id;
        END IF;

        IF v_batch_number IS NULL OR trim(v_batch_number) = '' THEN
            RAISE EXCEPTION 'Batch number cannot be empty';
        END IF;

        IF v_expiry_date IS NULL THEN
            RAISE EXCEPTION 'Expiry date cannot be empty';
        END IF;

        -- Attempt to find existing batch
        SELECT id INTO v_batch_id FROM public.product_batches 
        WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id AND batch_number = v_batch_number 
        LIMIT 1;

        IF v_batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET received_quantity = received_quantity + v_recv_qty, 
                available_quantity = available_quantity + v_recv_qty
            WHERE id = v_batch_id;
        ELSE
            -- Create batch
            INSERT INTO public.product_batches (
                product_id, warehouse_id, batch_number, expiry_date, received_quantity, available_quantity, status
            ) VALUES (
                item.product_id, p_warehouse_id, v_batch_number, v_expiry_date, v_recv_qty, v_recv_qty, 'active'
            ) RETURNING id INTO v_batch_id;
        END IF;

        -- Upsert stock (aggregate)
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty)
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity;

        -- Create stock ledger with batch_id
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty, 'grn', p_user_id, v_batch_id);
    END LOOP;

    -- Update procurement status atomically
    UPDATE public.procurement_orders 
    SET status = 'delivered' 
    WHERE id = p_procurement_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Revoke direct mutations
ALTER TABLE public.procurement_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin WH manage procurement_orders" ON public.procurement_orders;
CREATE POLICY "Admin WH manage procurement_orders" ON public.procurement_orders 
    FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

DROP POLICY IF EXISTS "Admin WH manage procurement_order_items" ON public.procurement_order_items;
CREATE POLICY "Admin WH manage procurement_order_items" ON public.procurement_order_items 
    FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

DROP POLICY IF EXISTS "Admin WH manage vendors" ON public.vendors;
CREATE POLICY "Admin WH manage vendors" ON public.vendors 
    FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));
