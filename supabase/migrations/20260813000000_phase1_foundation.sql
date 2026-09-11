-- Phase 1 Migration: FLASHGO Ecosystem Core Support

-- 1. Create New Tables
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    zone TEXT,
    aisle TEXT,
    rack TEXT,
    shelf TEXT,
    bin_barcode TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stock_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    quantity_change INTEGER NOT NULL,
    reason TEXT NOT NULL, -- 'grn', 'picking', 'damage', 'expiry', 'cycle_count'
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    original_item_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    suggested_product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    actioned_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.driver_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    vehicle_number TEXT,
    latest_lat DOUBLE PRECISION,
    latest_lng DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'offline', -- 'offline', 'idle', 'delivering'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    issue_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add Missing Columns Safely
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cod_wallet_liability DECIMAL(12,2) DEFAULT 0.00;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picking_status TEXT DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packing_status TEXT DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS inventory_location_id UUID REFERENCES public.inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT;

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_picker ON public.orders(picker_id) WHERE picker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_driver ON public.orders(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON public.warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON public.warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledgers_product ON public.stock_ledgers(product_id);

-- 4. Enable RLS on New Tables
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Warehouses & Stock: Admin and Warehouse Staff get ALL. Others can SELECT.
CREATE POLICY "All staff read warehouses" ON public.warehouses FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff', 'picker', 'driver')));
CREATE POLICY "Admin WH manage warehouses" ON public.warehouses FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

CREATE POLICY "All staff read warehouse_stock" ON public.warehouse_stock FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff', 'picker', 'driver')));
CREATE POLICY "Admin WH manage warehouse_stock" ON public.warehouse_stock FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

CREATE POLICY "All staff read inventory_locations" ON public.inventory_locations FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff', 'picker', 'driver')));
CREATE POLICY "Admin WH manage inventory_locations" ON public.inventory_locations FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

CREATE POLICY "Staff read stock_ledgers" ON public.stock_ledgers FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));
CREATE POLICY "Staff insert stock_ledgers" ON public.stock_ledgers FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff', 'picker')));

-- Order Substitutions
CREATE POLICY "Picker insert substitutions" ON public.order_substitutions FOR INSERT WITH CHECK (auth.uid() IN (SELECT picker_id FROM public.orders WHERE id = order_id));
CREATE POLICY "Picker select substitutions" ON public.order_substitutions FOR SELECT USING (auth.uid() IN (SELECT picker_id FROM public.orders WHERE id = order_id));
CREATE POLICY "Customer read update self substitutions" ON public.order_substitutions FOR ALL USING (auth.uid() IN (SELECT customer_id FROM public.orders WHERE id = order_id));

-- Driver Sessions
CREATE POLICY "Drivers manage own session" ON public.driver_sessions FOR ALL USING (auth.uid() = driver_id);
CREATE POLICY "Customers and staff read driver sessions" ON public.driver_sessions FOR SELECT USING (true);

-- Support Tickets
CREATE POLICY "Customer manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = customer_id);
CREATE POLICY "Admin Support manage tickets" ON public.support_tickets FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin')));

-- Drop existing permissive staff policy if it exists to enforce strict assigned-only access
DO $$ BEGIN
    DROP POLICY IF EXISTS "Staff update orders" ON public.orders;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Add strict UPDATE policies to Orders for Pickers/Drivers/Admin/Staff
CREATE POLICY "Picker update assigned orders" ON public.orders FOR UPDATE USING (auth.uid() = picker_id);
CREATE POLICY "Driver update assigned orders" ON public.orders FOR UPDATE USING (auth.uid() = driver_id);
CREATE POLICY "Admin Staff update orders" ON public.orders FOR UPDATE USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'warehouse_staff')));

-- 6. RPC Functions
-- 6.1 Process Wallet Transaction
CREATE OR REPLACE FUNCTION process_wallet_transaction(
    p_user_id UUID, 
    p_amount DECIMAL, 
    p_tx_type tx_type, 
    p_description TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_balance DECIMAL;
BEGIN
    -- Lock the row for update
    SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    
    IF p_tx_type = 'debit' AND v_current_balance < p_amount THEN
        RETURN FALSE; -- Insufficient funds
    END IF;

    -- Update balance
    IF p_tx_type = 'credit' THEN
        UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
    ELSE
        UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount WHERE id = p_user_id;
    END IF;

    -- Insert transaction record
    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_user_id, p_amount, p_tx_type, p_description);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 Driver COD Settlement
CREATE OR REPLACE FUNCTION driver_cod_settlement(
    p_driver_id UUID,
    p_amount DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
    v_liability DECIMAL;
BEGIN
    SELECT cod_wallet_liability INTO v_liability FROM public.profiles WHERE id = p_driver_id FOR UPDATE;
    
    IF v_liability < p_amount THEN
        -- Prevent over-settlement, or adjust to max liability
        UPDATE public.profiles SET cod_wallet_liability = 0 WHERE id = p_driver_id;
    ELSE
        UPDATE public.profiles SET cod_wallet_liability = cod_wallet_liability - p_amount WHERE id = p_driver_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.3 Deduct Inventory for Order
CREATE OR REPLACE FUNCTION deduct_inventory_for_order(
    p_order_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    item RECORD;
    v_stock INTEGER;
BEGIN
    FOR item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
        -- Check and lock stock
        SELECT quantity INTO v_stock FROM public.warehouse_stock WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
        
        IF v_stock IS NULL OR v_stock < item.quantity THEN
            RETURN FALSE; -- Stock insufficient
        END IF;

        -- Deduct stock
        UPDATE public.warehouse_stock SET quantity = quantity - item.quantity WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id;

        -- Log to ledger
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by)
        VALUES (p_warehouse_id, item.product_id, -item.quantity, 'picking', p_user_id);
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Realtime Additions
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.warehouse_stock;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_sessions;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


