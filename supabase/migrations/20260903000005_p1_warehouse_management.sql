-- Migration 20260903000005_p1_warehouse_management.sql

-- 1. PUTAWAY
-- We need to track the putaway state of received goods.
-- We can add a table for putaway queue.
CREATE TABLE IF NOT EXISTS public.putaway_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES public.product_batches(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    source_type TEXT NOT NULL, -- 'grn', 'return'
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    destination_location TEXT, -- AIisle/Rack/Shelf
    worker_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.putaway_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage putaway" ON public.putaway_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse Managers manage putaway" ON public.putaway_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_manager' AND warehouse_id = putaway_tasks.warehouse_id)
);
CREATE POLICY "Warehouse Staff view/update putaway" ON public.putaway_tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_staff', 'picker') AND warehouse_id = putaway_tasks.warehouse_id)
);

CREATE OR REPLACE FUNCTION complete_putaway_task(
    p_task_id UUID,
    p_destination_location TEXT,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_task RECORD;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM public.profiles 
    WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff') AND is_suspended = FALSE;

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_task FROM public.putaway_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF v_task.status = 'completed' THEN RETURN; END IF; -- Idempotent
    IF v_task.warehouse_id != v_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Cross-warehouse putaway blocked';
    END IF;

    UPDATE public.putaway_tasks 
    SET status = 'completed', destination_location = TRIM(p_destination_location), worker_id = p_user_id, completed_at = now()
    WHERE id = p_task_id;

    -- Note: Putaway doesn't create inventory, GRN already did that.
    -- We just log the movement if necessary or update product location.
    UPDATE public.warehouse_stock
    SET warehouse_location = TRIM(p_destination_location)
    WHERE warehouse_id = v_task.warehouse_id AND product_id = v_task.product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. CYCLE COUNTS
CREATE TABLE IF NOT EXISTS public.cycle_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES public.product_batches(id) ON DELETE CASCADE, -- NULL means counting total aggregate
    location TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'counting', 'submitted', 'approved', 'rejected')),
    system_quantity INTEGER NOT NULL,
    counted_quantity INTEGER,
    variance INTEGER,
    counter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.cycle_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage counts" ON public.cycle_counts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Warehouse Managers manage counts" ON public.cycle_counts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_manager' AND warehouse_id = cycle_counts.warehouse_id)
);
CREATE POLICY "Staff count" ON public.cycle_counts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_staff', 'picker') AND warehouse_id = cycle_counts.warehouse_id)
);
CREATE POLICY "Staff update counts" ON public.cycle_counts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('warehouse_staff', 'picker') AND warehouse_id = cycle_counts.warehouse_id)
);

CREATE OR REPLACE FUNCTION submit_cycle_count(
    p_count_id UUID,
    p_counted_qty INTEGER,
    p_notes TEXT,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_count RECORD;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM public.profiles 
    WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager', 'warehouse_staff', 'picker') AND is_suspended = FALSE;

    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count.id IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;
    IF v_count.status IN ('submitted', 'approved', 'rejected') THEN RAISE EXCEPTION 'Already submitted or resolved'; END IF;
    
    UPDATE public.cycle_counts 
    SET status = 'submitted', counted_quantity = p_counted_qty, variance = (p_counted_qty - system_quantity), 
        notes = COALESCE(p_notes, notes), counter_id = p_user_id, submitted_at = now()
    WHERE id = p_count_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION resolve_cycle_count(
    p_count_id UUID,
    p_status TEXT, -- 'approved' or 'rejected'
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_count RECORD;
    v_warehouse_id UUID;
    v_role TEXT;
BEGIN
    SELECT warehouse_id, role INTO v_warehouse_id, v_role FROM public.profiles 
    WHERE id = p_user_id AND is_suspended = FALSE;

    IF v_role NOT IN ('admin', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count.id IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;
    IF v_count.status != 'submitted' THEN RAISE EXCEPTION 'Count must be submitted to be resolved'; END IF;
    IF v_count.warehouse_id != v_warehouse_id AND v_role != 'admin' THEN RAISE EXCEPTION 'Cross-warehouse resolution blocked'; END IF;
    
    UPDATE public.cycle_counts 
    SET status = p_status, reviewer_id = p_user_id, resolved_at = now()
    WHERE id = p_count_id;

    IF p_status = 'approved' AND v_count.variance != 0 THEN
        IF v_count.batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET available_quantity = available_quantity + v_count.variance
            WHERE id = v_count.batch_id;
        END IF;

        UPDATE public.warehouse_stock 
        SET quantity = quantity + v_count.variance
        WHERE warehouse_id = v_count.warehouse_id AND product_id = v_count.product_id;

        INSERT INTO public.stock_ledgers (
            warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
        ) VALUES (
            v_count.warehouse_id, v_count.product_id, v_count.batch_id, v_count.variance, 'cycle_count', p_user_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. WAREHOUSE SERVICEABILITY TOGGLE
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update get_serving_warehouse to respect is_active
DROP FUNCTION IF EXISTS get_serving_warehouse(FLOAT, FLOAT);
CREATE OR REPLACE FUNCTION get_serving_warehouse(p_lat FLOAT, p_lng FLOAT)
RETURNS TABLE (
    warehouse_id UUID,
    name TEXT,
    distance_km FLOAT,
    delivery_fee DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id as warehouse_id,
        w.name,
        calculate_distance(p_lat, p_lng, w.latitude, w.longitude) as distance_km,
        w.delivery_fee
    FROM public.warehouses w
    WHERE w.is_active = true 
      AND calculate_distance(p_lat, p_lng, w.latitude, w.longitude) <= w.service_radius_km
    ORDER BY distance_km ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RETURNS DISPOSITION & UNPACK QUEUE ENHANCEMENT
-- (Wave 1 added order_unpack_queue, we will reuse it for returns and disposition).
-- Let's ensure putaway tasks are created when items are received via GRN or Returns.

CREATE OR REPLACE FUNCTION receive_procurement_order(
    p_order_id UUID,
    p_user_id UUID,
    p_received_items JSONB -- [{product_id, quantity, batch_number, expiry_date, unit_price}]
) RETURNS void AS $$
DECLARE
    v_order RECORD;
    v_item JSONB;
    v_batch_id UUID;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id
    FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'warehouse_manager');
    
    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_order FROM public.procurement_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL OR v_order.status != 'approved' THEN
        RAISE EXCEPTION 'Order not found or not approved';
    END IF;

    IF v_order.warehouse_id != v_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Cross-warehouse receive blocked';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
        INSERT INTO public.product_batches (
            product_id, warehouse_id, batch_number, expiry_date, initial_quantity, available_quantity, unit_cost
        ) VALUES (
            (v_item->>'product_id')::UUID,
            v_order.warehouse_id,
            v_item->>'batch_number',
            (v_item->>'expiry_date')::DATE,
            (v_item->>'quantity')::INTEGER,
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::DECIMAL
        ) RETURNING id INTO v_batch_id;

        UPDATE public.warehouse_stock
        SET quantity = quantity + (v_item->>'quantity')::INTEGER
        WHERE product_id = (v_item->>'product_id')::UUID AND warehouse_id = v_order.warehouse_id;

        INSERT INTO public.stock_ledgers (
            warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
        ) VALUES (
            v_order.warehouse_id, (v_item->>'product_id')::UUID, v_batch_id, (v_item->>'quantity')::INTEGER, 'grn', p_user_id
        );

        -- Add to Putaway Queue
        INSERT INTO public.putaway_tasks (warehouse_id, product_id, batch_id, quantity, source_type)
        VALUES (v_order.warehouse_id, (v_item->>'product_id')::UUID, v_batch_id, (v_item->>'quantity')::INTEGER, 'grn');
    END LOOP;

    UPDATE public.procurement_orders SET status = 'received', received_at = now() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
