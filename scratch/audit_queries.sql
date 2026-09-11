SELECT jsonb_build_object(
  'profiles_cols', (SELECT json_agg(column_name) FROM information_schema.columns WHERE table_name = 'profiles' AND table_schema = 'public'),
  'categories_cols', (SELECT json_agg(column_name) FROM information_schema.columns WHERE table_name = 'categories' AND table_schema = 'public'),
  'products_cols', (SELECT json_agg(column_name) FROM information_schema.columns WHERE table_name = 'products' AND table_schema = 'public'),
  'wallet_cols', (SELECT json_agg(column_name) FROM information_schema.columns WHERE table_name = 'wallet_transactions' AND table_schema = 'public'),
  'role_constraint', (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'profiles' AND c.contype = 'c' LIMIT 1),
  'order_items_policy', (SELECT json_agg(json_build_object('name', polname, 'cmd', polcmd, 'roles', polroles, 'qual', pg_get_expr(polqual, polrelid))) FROM pg_policy WHERE polrelid = 'public.order_items'::regclass),
  'views', (SELECT json_agg(table_name) FROM information_schema.views WHERE table_schema = 'public'),
  'functions', (SELECT json_agg(json_build_object('name', p.proname, 'config', p.proconfig)) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prosecdef = true)
);
