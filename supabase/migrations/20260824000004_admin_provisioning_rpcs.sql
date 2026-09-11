-- Phase 17.2: Admin Inventory Provisioning

CREATE OR REPLACE FUNCTION inward_stock_batch(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_expiry_date DATE,
    p_batch_number TEXT,
    p_admin_id UUID
) RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- 1. Validate permissions
    SELECT (role IN ('admin', 'warehouse_staff')) INTO v_is_admin 
    FROM public.profiles 
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins or warehouse staff can inward stock';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Inward quantity must be positive';
    END IF;

    -- 2. Create the batch
    INSERT INTO public.product_batches (
        product_id, 
        warehouse_id, 
        batch_number, 
        expiry_date, 
        received_quantity, 
        available_quantity, 
        status
    ) VALUES (
        p_product_id,
        p_warehouse_id,
        COALESCE(p_batch_number, 'B-' || to_char(now(), 'YYYYMMDD-HH24MISS')),
        p_expiry_date,
        p_quantity,
        p_quantity,
        'active'
    ) RETURNING id INTO v_batch_id;

    -- 3. Upsert warehouse stock
    INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
    VALUES (p_warehouse_id, p_product_id, p_quantity)
    ON CONFLICT (warehouse_id, product_id) 
    DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity;

    -- 4. Record ledger
    INSERT INTO public.stock_ledgers (
        warehouse_id, 
        product_id, 
        batch_id, 
        quantity_change, 
        reason, 
        performed_by
    ) VALUES (
        p_warehouse_id,
        p_product_id,
        v_batch_id,
        p_quantity,
        'inward',
        p_admin_id
    );

    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
