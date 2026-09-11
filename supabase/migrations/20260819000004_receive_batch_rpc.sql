-- Phase 12.2: Batch Receiving / GRN Integration

DROP FUNCTION IF EXISTS receive_procurement_order(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID,
    p_batches JSONB DEFAULT '[]'::jsonb
) RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_target_warehouse UUID;
    item RECORD;
    v_batch_json JSONB;
    v_batch_id UUID;
    v_batch_number TEXT;
    v_expiry_date DATE;
    v_recv_qty INTEGER;
BEGIN
    -- Lock the procurement order
    SELECT status, warehouse_id INTO v_status, v_target_warehouse 
    FROM public.procurement_orders 
    WHERE id = p_procurement_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN FALSE; -- Not found
    END IF;

    IF v_status = 'received' OR v_status = 'delivered' OR v_status = 'cancelled' THEN
        RETURN FALSE; -- Already processed
    END IF;

    IF v_target_warehouse != p_warehouse_id THEN
        RETURN FALSE; -- Wrong warehouse
    END IF;

    -- Update procurement status
    UPDATE public.procurement_orders 
    SET status = 'delivered' 
    WHERE id = p_procurement_id;

    -- Loop through items and atomically update stock
    FOR item IN SELECT product_id, quantity FROM public.procurement_order_items WHERE procurement_order_id = p_procurement_id
    LOOP
        -- Find the batch entry from the JSON array where product_id matches
        -- We extract the first matching batch for this product.
        SELECT * INTO v_batch_json 
        FROM jsonb_array_elements(p_batches) AS b 
        WHERE (b->>'product_id')::UUID = item.product_id 
        LIMIT 1;
        
        -- Default values if not provided (fallback for backward compatibility if p_batches is empty)
        IF v_batch_json IS NULL THEN
            v_batch_number := 'BAT-' || extract(epoch from now())::text;
            v_expiry_date := current_date + interval '30 days';
            v_recv_qty := item.quantity;
        ELSE
            v_batch_number := v_batch_json->>'batch_number';
            v_expiry_date := (v_batch_json->>'expiry_date')::DATE;
            v_recv_qty := (v_batch_json->>'received_quantity')::INTEGER;
            
            -- Validate quantity against PO
            IF v_recv_qty > item.quantity THEN
                RAISE EXCEPTION 'Received quantity (%) cannot exceed PO quantity (%) for product %', v_recv_qty, item.quantity, item.product_id;
            END IF;
            IF v_recv_qty <= 0 THEN
                RAISE EXCEPTION 'Received quantity must be positive';
            END IF;
            IF v_batch_number IS NULL OR v_batch_number = '' THEN
                RAISE EXCEPTION 'Batch number cannot be empty';
            END IF;
            IF v_expiry_date IS NULL OR v_expiry_date < current_date THEN
                RAISE EXCEPTION 'Invalid expiry date';
            END IF;
        END IF;

        -- Create batch
        INSERT INTO public.product_batches (
            product_id, warehouse_id, batch_number, expiry_date, received_quantity, available_quantity, status
        ) VALUES (
            item.product_id, p_warehouse_id, v_batch_number, v_expiry_date, v_recv_qty, v_recv_qty, 'active'
        ) RETURNING id INTO v_batch_id;

        -- Upsert stock (aggregate) using the actual received quantity
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty)
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity;

        -- Create stock ledger with batch_id
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty, 'grn', p_user_id, v_batch_id);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
