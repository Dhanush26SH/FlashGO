-- Migration: 20260922000001_staff_support_update.sql
-- Description: Explicitly grant UPDATE permissions to admins for staff support tickets to fix the silent RLS rejection.

CREATE POLICY "Admins can update staff tickets explicitly" 
    ON public.staff_support_tickets 
    FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
