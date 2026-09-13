-- Migration: 20260916000038_order_architecture_snapshots.sql
-- Description: Implement strict order lifecycle, snapshots, and append-only events.

-- 1. Orders: Snapshots & Billing Fields
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_snapshot_name TEXT,
ADD COLUMN IF NOT EXISTS customer_snapshot_phone TEXT,
ADD COLUMN IF NOT EXISTS customer_snapshot_email TEXT,
ADD COLUMN IF NOT EXISTS warehouse_name_snapshot TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_formatted TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_flat TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_floor TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_landmark TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_locality TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_state TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_postcode TEXT,
ADD COLUMN IF NOT EXISTS address_snapshot_instructions TEXT,
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS handling_fee DECIMAL(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS wallet_applied_amount DECIMAL(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12,2) DEFAULT 0.00;

-- Apply CHECK constraints safely
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_subtotal_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_subtotal_check CHECK (subtotal_amount >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_handling_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_handling_check CHECK (handling_fee >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tax_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_tax_check CHECK (tax_amount >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_wallet_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_wallet_check CHECK (wallet_applied_amount >= 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refunded_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_refunded_check CHECK (refunded_amount >= 0);

-- 2. Order Items: Product Snapshots
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
ADD COLUMN IF NOT EXISTS product_image_snapshot TEXT,
ADD COLUMN IF NOT EXISTS sku_snapshot TEXT,
ADD COLUMN IF NOT EXISTS manufacturer_barcode_snapshot TEXT,
ADD COLUMN IF NOT EXISTS cancelled_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS substituted_quantity INTEGER DEFAULT 0;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS oi_quantities_check;
ALTER TABLE public.order_items ADD CONSTRAINT oi_quantities_check CHECK (
    quantity > 0 AND 
    picked_quantity >= 0 AND 
    cancelled_quantity >= 0 AND 
    substituted_quantity >= 0
);

-- 3. Order Events (Append-Only)
CREATE TABLE IF NOT EXISTS public.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    idempotency_key TEXT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT,
    event_type TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id_created ON public.order_events(order_id, created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers see own events" ON public.order_events FOR SELECT
USING (EXISTS (SELECT 1 FROM public.orders WHERE id = order_events.order_id AND customer_id = auth.uid()));

CREATE POLICY "Warehouse staff see warehouse events" ON public.order_events FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = order_events.order_id 
    AND p.warehouse_id = o.warehouse_id
    AND p.role IN ('admin', 'warehouse_manager', 'warehouse_staff')
));

CREATE POLICY "Global admin sees all events" ON public.order_events FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.warehouse_id IS NULL
));

-- 4. Order Notes (Append-Only)
CREATE TABLE IF NOT EXISTS public.order_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    note TEXT NOT NULL CHECK (length(trim(note)) > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id_created ON public.order_notes(order_id, created_at);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
-- ONLY ADMINS can see notes
CREATE POLICY "Warehouse admins see warehouse notes" ON public.order_notes FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = order_notes.order_id 
    AND p.warehouse_id = o.warehouse_id
    AND p.role IN ('admin', 'warehouse_manager')
));

CREATE POLICY "Global admin sees all notes" ON public.order_notes FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.warehouse_id IS NULL
));

CREATE POLICY "Warehouse admins insert notes" ON public.order_notes FOR INSERT
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'warehouse_manager'))
);
