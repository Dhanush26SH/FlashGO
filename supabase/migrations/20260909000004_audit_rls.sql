-- 20260909000004_audit_rls.sql
CREATE OR REPLACE FUNCTION public.get_tables_without_rls()
RETURNS TABLE(schemaname name, tablename name, rls_enabled boolean)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
$$;
