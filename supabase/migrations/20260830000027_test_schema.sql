-- Migration: 20260830000027_test_schema.sql
CREATE OR REPLACE FUNCTION public.get_support_tickets_columns()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cols TEXT;
BEGIN
    SELECT string_agg(column_name, ', ') INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_tickets';
    RETURN cols;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_support_tickets_columns() TO anon;
