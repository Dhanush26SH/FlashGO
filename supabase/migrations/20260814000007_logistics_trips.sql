-- Migration: 20260814000007_logistics_trips.sql

-- 1. Create logistics_trips table
CREATE TABLE IF NOT EXISTS public.logistics_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT NOT NULL,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_transit', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add columns to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS delivery_sequence INTEGER;

-- 3. Enable RLS
ALTER TABLE public.logistics_trips ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for logistics_trips
-- Admin/Warehouse Staff have full access
CREATE POLICY "Admin and WH staff manage trips" 
ON public.logistics_trips 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('admin', 'warehouse_staff')
    )
);

-- Drivers can see pending trips in their assigned warehouse (if they have one) or all pending, 
-- and any trip assigned to them
CREATE POLICY "Driver view trips" 
ON public.logistics_trips 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'driver'
    )
    AND (
        status = 'pending' 
        OR driver_id = auth.uid()
    )
);

-- Drivers can update trips assigned to them (or to claim them)
CREATE POLICY "Driver update own trips" 
ON public.logistics_trips 
FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'driver'
    )
    AND (
        driver_id = auth.uid() 
        OR driver_id IS NULL
    )
);

-- 5. Add to realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'logistics_trips'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.logistics_trips;
    END IF;
END $$;
