-- 20260814000004_warehouse_inventory_rpcs.sql

-- 1. Create procurement_order_items table
CREATE TABLE IF NOT EXISTS public.procurement_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procurement_order_id UUID REFERENCES public.procurement_orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    quantity INTEGER NOT NULL,
    cost_per_unit DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for procurement_order_items
ALTER TABLE public.procurement_order_items ENABLE ROW LEVEL SECURITY;

-- Add policies
DROP POLICY IF EXISTS "Admin WH manage procurement items" ON public.procurement_order_items;
CREATE POLICY "Admin WH manage procurement items" 
ON public.procurement_order_items 
FOR ALL 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

-- Explicit policies for procurement_orders if missing
DO $$ BEGIN
    DROP POLICY IF EXISTS "Admin WH manage procurement_orders" ON public.procurement_orders;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
CREATE POLICY "Admin WH manage procurement_orders" 
ON public.procurement_orders 
FOR ALL 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

-- 2. Atomic Receiving RPC
CREATE OR REPLACE FUNCTION receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    item RECORD;
    v_status TEXT;
    v_target_warehouse UUID;
BEGIN
    -- Lock the procurement order
    SELECT status, warehouse_id INTO v_status, v_target_warehouse 
    FROM public.procurement_orders 
    WHERE id = p_procurement_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN FALSE; -- Not found
    END IF;

    IF v_status = 'received' OR v_status = 'cancelled' THEN
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
        -- Upsert stock
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, item.product_id, item.quantity)
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity;

        -- Create stock ledger
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by)
        VALUES (p_warehouse_id, item.product_id, item.quantity, 'grn', p_user_id);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Atomic Stock Adjustment RPC
CREATE OR REPLACE FUNCTION adjust_warehouse_stock(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_stock INTEGER;
BEGIN
    -- Lock the stock row
    SELECT quantity INTO v_current_stock 
    FROM public.warehouse_stock 
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id 
    FOR UPDATE;

    -- If no row exists and change is positive, we can create it
    IF v_current_stock IS NULL THEN
        IF p_quantity_change < 0 THEN
            RETURN FALSE; -- Cannot go negative
        END IF;

        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, p_product_id, p_quantity_change);
    ELSE
        -- Ensure we don't go negative
        IF v_current_stock + p_quantity_change < 0 THEN
            RETURN FALSE; -- Cannot go negative
        END IF;

        UPDATE public.warehouse_stock 
        SET quantity = quantity + p_quantity_change
        WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;
    END IF;

    -- Create ledger
    INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by)
    VALUES (p_warehouse_id, p_product_id, p_quantity_change, p_reason, p_user_id);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
