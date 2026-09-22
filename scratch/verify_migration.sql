SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;

SELECT policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'staff_support_tickets';
