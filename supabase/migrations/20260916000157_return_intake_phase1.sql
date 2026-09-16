-- Phase 1 Return Intake Schema and dormant RPCs

-- ============================================================================
-- 1. Opaque random QR challenge
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.return_handover_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_return_task_id UUID REFERENCES public.driver_return_tasks(id) ON DELETE CASCADE UNIQUE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.return_handover_challenges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. return_intakes (One per driver_return_task)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.return_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_return_task_id UUID REFERENCES public.driver_return_tasks(id) ON DELETE CASCADE UNIQUE,
    trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
    received_by_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scanning', 'completed', 'discrepancy')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ
);
ALTER TABLE public.return_intakes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_return_intakes_warehouse ON public.return_intakes(warehouse_id, status);

-- ============================================================================
-- 3. return_intake_items
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.return_intake_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_intake_id UUID REFERENCES public.return_intakes(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    expected_quantity INTEGER NOT NULL CHECK (expected_quantity >= 0),
    received_quantity INTEGER DEFAULT 0 NOT NULL CHECK (received_quantity >= 0),
    UNIQUE(return_intake_id, order_id, product_id)
);
ALTER TABLE public.return_intake_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. return_scan_operations (for scan idempotency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.return_scan_operations (
    scan_operation_id UUID PRIMARY KEY,
    return_intake_id UUID REFERENCES public.return_intakes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.return_scan_operations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_return_scan_ops_intake ON public.return_scan_operations(return_intake_id);

-- ============================================================================
-- RPC: generate_return_handover_qr
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_return_handover_qr(p_task_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID;
    v_task public.driver_return_tasks;
    v_raw_token TEXT;
    v_token_hash TEXT;
BEGIN
    v_driver_id := auth.uid();
    
    -- Verify task exists, is active, and belongs to the calling driver
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = p_task_id AND driver_id = v_driver_id AND status = 'required';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task not found or unauthorized';
    END IF;

    -- Generate a cryptographically random token
    v_raw_token := encode(gen_random_bytes(24), 'base64');
    
    -- We assume pgcrypto extension is installed
    v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

    -- Insert or replace the challenge for this task
    INSERT INTO public.return_handover_challenges (
        driver_return_task_id, token_hash, expires_at
    )
    VALUES (
        p_task_id, v_token_hash, now() + interval '5 minutes'
    )
    ON CONFLICT (driver_return_task_id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL,
        created_at = now();

    RETURN v_raw_token;
END;
$$;

-- ============================================================================
-- RPC: staff_start_return_intake
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_raw_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_token_hash TEXT;
    v_challenge public.return_handover_challenges;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- Must have an active shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Hash the incoming token
    v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

    -- Find and lock the challenge (atomic check-and-consume)
    SELECT * INTO v_challenge
    FROM public.return_handover_challenges
    WHERE token_hash = v_token_hash 
      AND expires_at > now() 
      AND consumed_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or consumed QR challenge';
    END IF;

    -- Find the task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_challenge.driver_return_task_id AND status = 'required';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task is no longer required';
    END IF;

    -- Ensure staff shift warehouse matches task warehouse
    IF v_active_shift.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse than the return task';
    END IF;

    -- Mark challenge consumed
    UPDATE public.return_handover_challenges 
    SET consumed_at = now() 
    WHERE id = v_challenge.id;

    -- Insert the intake session
    INSERT INTO public.return_intakes (
        driver_return_task_id, trip_id, driver_id, warehouse_id, received_by_staff_id, status
    )
    VALUES (
        v_task.id, v_task.trip_id, v_task.driver_id, v_task.warehouse_id, v_staff_id, 'scanning'
    )
    RETURNING id INTO v_intake_id;

    -- Populate expected return items using valid cancelled order statuses for the trip
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        v_intake_id,
        o.id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.trip_id = v_task.trip_id AND o.status = 'cancelled';

    RETURN v_intake_id;
END;
$$;

-- ============================================================================
-- RPC: staff_scan_return_item
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_scan_return_item(
    p_intake_id UUID,
    p_barcode TEXT,
    p_scan_operation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_active_shift public.staff_shifts;
    v_intake public.return_intakes;
    v_product_id UUID;
    v_item public.return_intake_items;
BEGIN
    v_staff_id := auth.uid();

    -- Check if scan_operation_id already exists (idempotency)
    IF EXISTS (SELECT 1 FROM public.return_scan_operations WHERE scan_operation_id = p_scan_operation_id) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already scanned');
    END IF;

    -- Verify Staff shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Verify Intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id AND status = 'scanning';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found or not in scanning state';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;
    
    IF v_intake.warehouse_id != v_active_shift.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse';
    END IF;

    -- Resolve Barcode
    SELECT id INTO v_product_id
    FROM public.products
    WHERE internal_barcode = p_barcode;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid barcode';
    END IF;

    -- Find the item in the intake and lock it
    -- There could be multiple order_items with same product in different orders on the trip.
    -- We need to increment the first one that has received < expected.
    SELECT * INTO v_item
    FROM public.return_intake_items
    WHERE return_intake_id = p_intake_id 
      AND product_id = v_product_id
      AND received_quantity < expected_quantity
    ORDER BY order_id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not expected or already fully received';
    END IF;

    -- Record the idempotent operation
    INSERT INTO public.return_scan_operations (scan_operation_id, return_intake_id)
    VALUES (p_scan_operation_id, p_intake_id);

    -- Increment
    UPDATE public.return_intake_items
    SET received_quantity = received_quantity + 1
    WHERE id = v_item.id;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id);
END;
$$;

-- ============================================================================
-- RPC: staff_complete_return_intake
-- ============================================================================
CREATE OR REPLACE FUNCTION public.staff_complete_return_intake(p_intake_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_intake public.return_intakes;
    v_total_expected INTEGER;
    v_total_received INTEGER;
    v_final_status TEXT;
BEGIN
    v_staff_id := auth.uid();

    -- Lock the intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intake not found';
    END IF;
    
    -- Idempotency check: if already completed/discrepancy, just return success
    IF v_intake.status IN ('completed', 'discrepancy') THEN
        RETURN jsonb_build_object('success', true, 'status', v_intake.status);
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'Unauthorized: Intake belongs to another staff member';
    END IF;

    -- Calculate variance
    SELECT COALESCE(SUM(expected_quantity), 0), COALESCE(SUM(received_quantity), 0)
    INTO v_total_expected, v_total_received
    FROM public.return_intake_items
    WHERE return_intake_id = p_intake_id;

    IF v_total_received >= v_total_expected THEN
        v_final_status := 'completed';
    ELSE
        v_final_status := 'discrepancy';
    END IF;

    -- Update intake
    UPDATE public.return_intakes
    SET status = v_final_status,
        completed_at = now()
    WHERE id = p_intake_id;

    -- Update the driver task
    UPDATE public.driver_return_tasks
    SET status = 'completed',
        completed_at = now()
    WHERE id = v_intake.driver_return_task_id;

    RETURN jsonb_build_object('success', true, 'status', v_final_status);
END;
$$;
