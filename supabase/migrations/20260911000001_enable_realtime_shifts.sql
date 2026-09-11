-- Enable realtime for staff_shifts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'staff_shifts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_shifts;
    END IF;
END
$$;
