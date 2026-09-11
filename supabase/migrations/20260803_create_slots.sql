-- Migration: Create Slots Table for Gig Workers

CREATE TABLE IF NOT EXISTS public.slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    store_location TEXT NOT NULL,
    payout_min NUMERIC NOT NULL,
    payout_max NUMERIC NOT NULL,
    capacity INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open', -- 'open', 'full', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.slot_bookings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slot_id UUID NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
    picker_id UUID NOT NULL, -- references auth.users or profiles
    status TEXT NOT NULL DEFAULT 'booked', -- 'booked', 'cancelled_by_picker', 'cancelled_by_admin', 'completed', 'no_show'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_bookings ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for all authenticated users"
ON public.slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read access for all authenticated users"
ON public.slot_bookings FOR SELECT TO authenticated USING (true);

-- Allow admins full access (simplified for prototype)
CREATE POLICY "Allow all access for admins"
ON public.slots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for admins"
ON public.slot_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

