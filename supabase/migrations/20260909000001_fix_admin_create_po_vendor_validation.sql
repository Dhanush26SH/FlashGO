-- 20260909000001_fix_admin_create_po_vendor_validation.sql

-- Drop the broken 4-argument signature that was accidentally introduced
DROP FUNCTION IF EXISTS public.admin_create_po(UUID, UUID, JSONB, UUID);

-- Repaired admin_create_po function that removes the accidental created_by reference
-- but strictly preserves the new vendor_products mapping validation.
CREATE OR REPLACE FUNCTION public.admin_create_po(p_vendor_id uuid, p_warehouse_id uuid, p_items jsonb)
 RETURNS procurement_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
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

        -- NEW VALIDATION: Check if product is explicitly mapped to vendor
        IF NOT EXISTS (
            SELECT 1 FROM public.vendor_products vp
            WHERE vp.vendor_id = p_vendor_id 
              AND vp.product_id = v_product_id
              AND vp.is_active = true
        ) THEN
            RAISE EXCEPTION 'Product % is not mapped to vendor %', v_product_id, p_vendor_id;
        END IF;

        v_total_cost := v_total_cost + (v_qty * v_cost);
    END LOOP;

    -- Create PO (Restored original columns)
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

    -- Standard audit logging using previously working 6-arg signature
    PERFORM public.write_admin_audit_log(
        'PO_CREATED', 'procurement_orders', (v_po.id)::text, p_warehouse_id, NULL,
        jsonb_build_object('vendor_id', p_vendor_id, 'total', v_total_cost, 'items', p_items)
    );

    RETURN v_po;
END;
$BODY$;
