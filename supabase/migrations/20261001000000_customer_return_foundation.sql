-- Migration: 20261001000000_customer_return_foundation.sql
-- Description: Foundation for Phase 2A Customer Damaged Return Order

-- 1. Create Isolated Tables
CREATE TABLE public.customer_return_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    assigned_driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    support_ticket_id UUID REFERENCES public.support_tickets(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'awaiting_assignment' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT customer_return_tasks_status_check CHECK (status = ANY (ARRAY['awaiting_assignment'::text, 'offered'::text, 'accepted'::text, 'at_customer'::text, 'picked_up'::text, 'at_warehouse'::text, 'completed'::text, 'declined'::text, 'cancelled'::text]))
);
ALTER TABLE public.customer_return_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_task_id UUID REFERENCES public.customer_return_tasks(id) ON DELETE CASCADE NOT NULL,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE NOT NULL,
    expected_quantity INTEGER NOT NULL CHECK (expected_quantity > 0),
    UNIQUE(customer_return_task_id, order_item_id)
);
ALTER TABLE public.customer_return_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_return_handover_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_task_id UUID REFERENCES public.customer_return_tasks(id) ON DELETE CASCADE NOT NULL UNIQUE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.customer_return_handover_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_return_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_task_id UUID REFERENCES public.customer_return_tasks(id) ON DELETE CASCADE NOT NULL UNIQUE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    received_by_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'scanning' NOT NULL CHECK (status = ANY(ARRAY['scanning'::text, 'completed'::text, 'discrepancy'::text])),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.customer_return_intakes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_return_intake_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_intake_id UUID REFERENCES public.customer_return_intakes(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    expected_quantity INTEGER NOT NULL DEFAULT 0,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(customer_return_intake_id, order_id, product_id)
);
ALTER TABLE public.customer_return_intake_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customer_return_task_declines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_return_task_id UUID REFERENCES public.customer_return_tasks(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    declined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.customer_return_task_declines ENABLE ROW LEVEL SECURITY;

-- 2. Modify order_unpack_queue
ALTER TABLE public.order_unpack_queue DROP CONSTRAINT IF EXISTS order_unpack_queue_order_id_key;
ALTER TABLE public.order_unpack_queue DROP CONSTRAINT IF EXISTS order_unpack_queue_source_unique;

ALTER TABLE public.order_unpack_queue ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.order_unpack_queue ADD COLUMN IF NOT EXISTS source_reference_id UUID;

UPDATE public.order_unpack_queue
SET source_type = 'legacy', source_reference_id = id
WHERE source_type IS NULL;

ALTER TABLE public.order_unpack_queue ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.order_unpack_queue ALTER COLUMN source_reference_id SET NOT NULL;

ALTER TABLE public.order_unpack_queue ADD CONSTRAINT order_unpack_queue_source_unique UNIQUE(source_type, source_reference_id);

-- 3. RLS Policies
-- customer_return_tasks
CREATE POLICY "Admin full access customer_return_tasks" ON public.customer_return_tasks FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Driver own access customer_return_tasks" ON public.customer_return_tasks FOR SELECT USING (assigned_driver_id = auth.uid());
CREATE POLICY "Staff own access customer_return_tasks" ON public.customer_return_tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff' AND warehouse_id = customer_return_tasks.warehouse_id));

-- customer_return_items
CREATE POLICY "Admin full access customer_return_items" ON public.customer_return_items FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Driver own access customer_return_items" ON public.customer_return_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.customer_return_tasks WHERE id = customer_return_task_id AND assigned_driver_id = auth.uid()));
CREATE POLICY "Staff view customer_return_items" ON public.customer_return_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff'));

-- customer_return_handover_challenges
CREATE POLICY "Admin full access customer_return_handover_challenges" ON public.customer_return_handover_challenges FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Staff view challenges" ON public.customer_return_handover_challenges FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff'));

-- customer_return_intakes
CREATE POLICY "Admin full access customer_return_intakes" ON public.customer_return_intakes FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Staff own access customer_return_intakes" ON public.customer_return_intakes FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff' AND warehouse_id = customer_return_intakes.warehouse_id));

-- customer_return_intake_items
CREATE POLICY "Admin full access customer_return_intake_items" ON public.customer_return_intake_items FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Staff view customer_return_intake_items" ON public.customer_return_intake_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'warehouse_staff'));

-- customer_return_task_declines
CREATE POLICY "Admin full access customer_return_task_declines" ON public.customer_return_task_declines FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Dispatch Modification
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
BEGIN
    UPDATE public.driver_trip_offers dto
    SET status = 'expired', responded_at = NOW()
    FROM public.logistics_trips lt
    WHERE dto.trip_id = lt.id
      AND dto.status = 'offered'
      AND dto.expires_at <= NOW()
      AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id);

    FOR v_trip IN
        SELECT lt.id, lt.warehouse_id, lt.created_at
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers active_dto
            ON active_dto.trip_id = lt.id AND active_dto.status = 'offered'
        WHERE lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND active_dto.id IS NULL
          AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id)
          -- PHASE 2 EXCLUSION: exclude trips that are safely inside a drop zone allocation
          AND NOT EXISTS (
              SELECT 1 FROM public.drop_zone_allocations dza
              WHERE dza.trip_id = lt.id AND dza.status IN ('allocated', 'placed', 'driver_assigned')
          )
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        -- GUARD: Never create a ghost offer for a trip whose 15-second direct handover window has already expired
        IF (v_trip.created_at + INTERVAL '15 seconds') <= NOW() THEN
            CONTINUE;
        END IF;

        SELECT COUNT(*) INTO v_attempt_count FROM public.driver_trip_offers WHERE trip_id = v_trip.id;

        IF v_attempt_count >= 3 THEN
            UPDATE public.logistics_trips SET status = 'dispatch_failed', updated_at = NOW() WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_driver_id
        FROM public.profiles p
        JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
            AND ss.status = 'active'
            AND ss.warehouse_id = v_trip.warehouse_id
            AND ss.shift_end > NOW()
        WHERE p.role = 'driver'
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips busy
              WHERE busy.driver_id = p.id 
              AND (
                busy.status IN ('accepted', 'in_transit')
                OR (busy.status = 'completed' AND busy.completion_acknowledged_at IS NULL)
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers active_dto
              WHERE active_dto.driver_id = p.id
                AND active_dto.status = 'offered'
                AND active_dto.expires_at > NOW()
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_return_tasks drt
              WHERE drt.driver_id = p.id AND drt.status = 'required'
          )
          -- ADDITIVE PREDICATE: exclude drivers who have an active customer return responsibility
          AND NOT EXISTS (
              SELECT 1 FROM public.customer_return_tasks crt
              WHERE crt.assigned_driver_id = p.id AND crt.status IN ('offered', 'accepted', 'at_customer', 'picked_up', 'at_warehouse')
          )
        ORDER BY
            (SELECT MAX(lt2.updated_at)
             FROM public.logistics_trips lt2
             WHERE lt2.driver_id = p.id AND lt2.status IN ('completed', 'cancelled')
            ) ASC NULLS FIRST,
            ds.updated_at ASC
        FOR UPDATE OF p SKIP LOCKED
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, v_trip.created_at + INTERVAL '15 seconds');
        END IF;
    END LOOP;
END;
$$;

-- 5. Admin RPC: create_customer_return
CREATE OR REPLACE FUNCTION public.admin_create_customer_return(
    p_order_id UUID,
    p_reason TEXT,
    p_support_ticket_id UUID,
    p_items JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_order RECORD;
    v_item RECORD;
    v_req_item JSONB;
    v_req_item_id UUID;
    v_req_quantity INT;
    v_committed_qty INT;
    v_returnable_qty INT;
    v_task_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF v_order.status != 'delivered' THEN RAISE EXCEPTION 'Order must be delivered to create a customer return'; END IF;

    INSERT INTO public.customer_return_tasks (
        order_id, warehouse_id, created_by, support_ticket_id, reason, status
    ) VALUES (
        p_order_id, v_order.warehouse_id, v_admin_id, p_support_ticket_id, p_reason, 'awaiting_assignment'
    ) RETURNING id INTO v_task_id;

    FOR v_req_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_req_item_id := (v_req_item->>'order_item_id')::UUID;
        v_req_quantity := (v_req_item->>'quantity')::INT;
        
        IF v_req_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0'; END IF;

        SELECT * INTO v_item FROM public.order_items WHERE id = v_req_item_id FOR UPDATE;
        IF v_item IS NULL OR v_item.order_id != p_order_id THEN
            RAISE EXCEPTION 'Invalid order item % for order %', v_req_item_id, p_order_id;
        END IF;

        SELECT COALESCE(SUM(expected_quantity), 0) INTO v_committed_qty
        FROM public.customer_return_items cri
        JOIN public.customer_return_tasks crt ON crt.id = cri.customer_return_task_id
        WHERE cri.order_item_id = v_req_item_id
          AND crt.status NOT IN ('declined', 'cancelled');
          
        v_returnable_qty := v_item.quantity - v_committed_qty;
        
        IF v_req_quantity > v_returnable_qty THEN
            RAISE EXCEPTION 'Requested quantity % exceeds returnable quantity % for item %', v_req_quantity, v_returnable_qty, v_req_item_id;
        END IF;

        INSERT INTO public.customer_return_items (
            customer_return_task_id, order_item_id, expected_quantity
        ) VALUES (
            v_task_id, v_req_item_id, v_req_quantity
        );
    END LOOP;

    RETURN v_task_id;
END;
$$;

-- 6. Admin RPC: assign_customer_return_driver
CREATE OR REPLACE FUNCTION public.admin_assign_customer_return_driver(
    p_task_id UUID,
    p_driver_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_task RECORD;
    v_driver RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    IF v_task.status != 'awaiting_assignment' THEN
        RAISE EXCEPTION 'Task is not awaiting assignment';
    END IF;

    SELECT p.* INTO v_driver
    FROM public.profiles p
    JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
        AND ss.status = 'active'
        AND ss.warehouse_id = v_task.warehouse_id
        AND ss.shift_end > NOW()
    WHERE p.id = p_driver_id
      AND p.role = 'driver'
      AND p.is_online = true
      AND COALESCE(p.is_suspended, false) = false
      AND NOT EXISTS (
          SELECT 1 FROM public.logistics_trips busy
          WHERE busy.driver_id = p.id 
          AND (
            busy.status IN ('accepted', 'in_transit')
            OR (busy.status = 'completed' AND busy.completion_acknowledged_at IS NULL)
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.driver_trip_offers active_dto
          WHERE active_dto.driver_id = p.id
            AND active_dto.status = 'offered'
            AND active_dto.expires_at > NOW()
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.driver_return_tasks drt
          WHERE drt.driver_id = p.id AND drt.status = 'required'
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.customer_return_tasks crt
          WHERE crt.assigned_driver_id = p.id AND crt.status IN ('offered', 'accepted', 'at_customer', 'picked_up', 'at_warehouse')
      )
    FOR UPDATE OF p;

    IF v_driver IS NULL THEN
        RAISE EXCEPTION 'Driver is not available, offline, out of shift, or has active assignments.';
    END IF;

    UPDATE public.customer_return_tasks
    SET assigned_driver_id = p_driver_id,
        status = 'offered',
        updated_at = NOW()
    WHERE id = p_task_id;
END;
$$;

-- 7. Driver RPC: accept_customer_return
CREATE OR REPLACE FUNCTION public.driver_accept_customer_return(
    p_task_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
BEGIN
    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    
    IF v_task.status = 'accepted' AND v_task.assigned_driver_id = v_driver_id THEN
        RETURN;
    END IF;
    
    IF v_task.assigned_driver_id != v_driver_id THEN
        RAISE EXCEPTION 'Task is not assigned to you';
    END IF;
    IF v_task.status != 'offered' THEN
        RAISE EXCEPTION 'Task is not offered';
    END IF;

    UPDATE public.customer_return_tasks
    SET status = 'accepted', updated_at = NOW()
    WHERE id = p_task_id;
END;
$$;

-- 8. Driver RPC: decline_customer_return
CREATE OR REPLACE FUNCTION public.driver_decline_customer_return(
    p_task_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
BEGIN
    SELECT * INTO v_task FROM public.customer_return_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
    
    IF v_task.status = 'awaiting_assignment' AND v_task.assigned_driver_id IS NULL THEN
        RETURN;
    END IF;

    IF v_task.assigned_driver_id != v_driver_id THEN
        RAISE EXCEPTION 'Task is not assigned to you';
    END IF;
    IF v_task.status != 'offered' THEN
        RAISE EXCEPTION 'Task is not offered';
    END IF;

    UPDATE public.customer_return_tasks
    SET status = 'awaiting_assignment', assigned_driver_id = NULL, updated_at = NOW()
    WHERE id = p_task_id;

    INSERT INTO public.customer_return_task_declines (customer_return_task_id, driver_id)
    VALUES (p_task_id, v_driver_id);
END;
$$;
