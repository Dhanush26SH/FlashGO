-- Migration: 20260922000000_staff_support.sql
-- Description: End-to-end Staff Help & Support infrastructure

-- 1. Create Staff Support Tickets Table
CREATE TABLE IF NOT EXISTS public.staff_support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'low',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraints
ALTER TABLE public.staff_support_tickets ADD CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
ALTER TABLE public.staff_support_tickets ADD CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE public.staff_support_tickets ADD CONSTRAINT valid_category CHECK (
    category IN (
        'Task/Picking', 'Shift/Attendance', 'Payment/Payout', 'Scanner/App', 'Account/Profile', 'Other',
        'Delivery/Order', 'Shift/Check-in', 'Vehicle', 'GPS/App',
        'Warehouse Task', 'Salary/Payroll'
    )
);

-- 2. Create Staff Support Messages Table
CREATE TABLE IF NOT EXISTS public.staff_support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.staff_support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row Level Security for Tickets
ALTER TABLE public.staff_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own tickets" 
    ON public.staff_support_tickets 
    FOR SELECT 
    USING (auth.uid() = staff_id);

CREATE POLICY "Staff can create own tickets" 
    ON public.staff_support_tickets 
    FOR INSERT 
    WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Admins have full access to staff tickets" 
    ON public.staff_support_tickets 
    FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Row Level Security for Messages
ALTER TABLE public.staff_support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view messages of own tickets" 
    ON public.staff_support_messages 
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.staff_support_tickets 
            WHERE id = staff_support_messages.ticket_id AND staff_id = auth.uid()
        )
    );

CREATE POLICY "Staff can insert messages to open tickets" 
    ON public.staff_support_messages 
    FOR INSERT 
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.staff_support_tickets 
            WHERE id = staff_support_messages.ticket_id 
              AND staff_id = auth.uid() 
              AND status IN ('open', 'in_progress')
        )
    );

CREATE POLICY "Admins have full access to staff messages" 
    ON public.staff_support_messages 
    FOR ALL 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 5. Realtime Publication
alter publication supabase_realtime add table public.staff_support_tickets;
alter publication supabase_realtime add table public.staff_support_messages;
