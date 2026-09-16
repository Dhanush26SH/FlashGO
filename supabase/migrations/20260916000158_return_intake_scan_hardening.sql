-- Migration 158: Hardening Return Scan Idempotency

-- Add product_id to scan operations to verify the exact context of an idempotent retry
ALTER TABLE public.return_scan_operations
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;

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
    v_inserted_op_id UUID;
    v_existing_op public.return_scan_operations;
BEGIN
    v_staff_id := auth.uid();

    -- Resolve Barcode authoritatively FIRST
    SELECT id INTO v_product_id
    FROM public.products
    WHERE internal_barcode = p_barcode;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNKNOWN_BARCODE';
    END IF;

    -- Concurrency-Safe Idempotency Token Registration
    -- We insert it early. If it fails due to UNIQUE constraint, we DO NOTHING and return NULL.
    INSERT INTO public.return_scan_operations (scan_operation_id, return_intake_id, product_id)
    VALUES (p_scan_operation_id, p_intake_id, v_product_id)
    ON CONFLICT (scan_operation_id) DO NOTHING
    RETURNING scan_operation_id INTO v_inserted_op_id;

    IF v_inserted_op_id IS NULL THEN
        -- The UUID already existed before this transaction, or was inserted by a concurrent transaction.
        -- We must verify the context of the existing operation.
        SELECT * INTO v_existing_op
        FROM public.return_scan_operations
        WHERE scan_operation_id = p_scan_operation_id;

        -- If it matches the exact same intake AND product, it is a valid network retry / identical concurrent request.
        IF v_existing_op.return_intake_id = p_intake_id AND v_existing_op.product_id = v_product_id THEN
            RETURN jsonb_build_object('success', true, 'message', 'Already scanned', 'product_id', v_product_id);
        ELSE
            -- Conflict: The client is reusing a UUID for a different intake or different product!
            RAISE EXCEPTION 'SCAN_OPERATION_CONFLICT';
        END IF;
    END IF;

    -- At this point, we successfully acquired the idempotent token for this operation.
    -- If we fail any validation below, the transaction will roll back, implicitly releasing the token!

    -- Verify Staff shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Verify Intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE id = p_intake_id;

    IF NOT FOUND OR v_intake.status != 'scanning' THEN
        RAISE EXCEPTION 'INTAKE_NOT_SCANNING';
    END IF;

    IF v_intake.received_by_staff_id != v_staff_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    
    IF v_intake.warehouse_id != v_active_shift.warehouse_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Find the item in the intake and lock it for quantity increment
    -- The ORDER BY order_id LIMIT 1 correctly spills over to next order if first is full
    SELECT * INTO v_item
    FROM public.return_intake_items
    WHERE return_intake_id = p_intake_id 
      AND product_id = v_product_id
      AND received_quantity < expected_quantity
    ORDER BY order_id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        -- We need to distinguish between not expected vs already full
        IF EXISTS (
            SELECT 1 FROM public.return_intake_items 
            WHERE return_intake_id = p_intake_id AND product_id = v_product_id
        ) THEN
            RAISE EXCEPTION 'EXPECTED_QUANTITY_REACHED';
        ELSE
            RAISE EXCEPTION 'PRODUCT_NOT_EXPECTED';
        END IF;
    END IF;

    -- Increment the exact eligible row
    UPDATE public.return_intake_items
    SET received_quantity = received_quantity + 1
    WHERE id = v_item.id;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id);
END;
$$;
