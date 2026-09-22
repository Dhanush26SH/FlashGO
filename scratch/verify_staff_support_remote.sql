SELECT json_build_object(
  'tables', (SELECT json_agg(tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('staff_support_tickets', 'staff_support_messages')),
  'rls', (SELECT json_agg(json_build_object('relname', relname, 'rls', relrowsecurity)) FROM pg_class WHERE relname IN ('staff_support_tickets', 'staff_support_messages')),
  'policies', (SELECT json_agg(json_build_object('table', tablename, 'policy', policyname, 'cmd', cmd)) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('staff_support_tickets', 'staff_support_messages')),
  'realtime', (SELECT json_agg(tablename) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('staff_support_tickets', 'staff_support_messages')),
  'migration', (SELECT json_agg(version) FROM supabase_migrations.schema_migrations WHERE version = '20260922000000')
) as result;
