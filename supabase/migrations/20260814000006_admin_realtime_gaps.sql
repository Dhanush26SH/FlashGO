-- Migration: 20260814000006_admin_realtime_gaps.sql

-- 1. Add procurement_orders to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'procurement_orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.procurement_orders;
    END IF;
END $$;

-- 2. Add order_substitutions to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'order_substitutions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_substitutions;
    END IF;
END $$;

-- 3. Add minimum Admin SELECT RLS for order_substitutions
DROP POLICY IF EXISTS "Admin select substitutions" ON public.order_substitutions;

CREATE POLICY "Admin select substitutions" 
ON public.order_substitutions 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Note: AppContext.tsx also needs profiles subscription for online pickers/drivers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
END $$;
