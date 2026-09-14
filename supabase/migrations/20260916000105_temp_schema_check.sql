-- Migration: 20260916000105_temp_schema_check.sql
-- Description: Temp function to get putaway_tasks schema

CREATE OR REPLACE FUNCTION public.temp_schema_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cols JSONB;
BEGIN
    SELECT jsonb_agg(column_name) INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'putaway_tasks';
    
    RETURN v_cols;
END;
$$;
