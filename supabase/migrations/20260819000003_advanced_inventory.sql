-- Phase 12.1: Advanced Inventory Schema & RLS

-- 1. Create product_batches table
CREATE TABLE IF NOT EXISTS public.product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    received_quantity INTEGER NOT NULL,
    available_quantity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'depleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add nullable batch_id to stock_ledgers
ALTER TABLE public.stock_ledgers 
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.product_batches(id) ON DELETE SET NULL;

-- 3. Enable RLS
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

-- 4. Secure RLS Policies

-- Admins get full access
CREATE POLICY "Admins full access on product_batches"
ON public.product_batches
FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Warehouse staff get operational access (can manage batches for receiving/adjusting)
CREATE POLICY "Warehouse staff operational access on product_batches"
ON public.product_batches
FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'warehouse_staff'));

-- Pickers get SELECT access only (mutations happen via RPC)
CREATE POLICY "Pickers read access on product_batches"
ON public.product_batches
FOR SELECT
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'picker'));

-- 5. Add product_batches to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'product_batches'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.product_batches;
    END IF;
END $$;
