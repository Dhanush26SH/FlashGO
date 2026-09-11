const { execSync } = require('child_process');

function query(sql) {
    try {
        let out = execSync(`npx supabase db query "${sql}" --linked`, { encoding: 'utf8', stdio: 'pipe' });
        let jsonMatch = out.substring(out.indexOf('{'));
        return JSON.parse(jsonMatch).rows;
    } catch(e) {
        return 'Error: ' + e.message;
    }
}

console.log('--- 1. Check Table Existence ---');
console.log(query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications');"));

console.log('--- 2. Check Columns ---');
console.log(query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' ORDER BY ordinal_position;"));

console.log('--- 3. Check Constraints & Keys ---');
console.log(query("SELECT conname, contype, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND conrelid = 'public.notifications'::regclass;"));

console.log('--- 4. Check Indexes ---');
console.log(query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'notifications';"));

console.log('--- 5. Check RLS ---');
console.log(query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notifications'::regclass;"));

console.log('--- 6. Check Policies ---');
console.log(query("SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as with_check FROM pg_policy WHERE polrelid = 'public.notifications'::regclass;"));

console.log('--- 7. Check Realtime ---');
console.log(query("SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';"));

console.log('--- 8. Check Migration History ---');
console.log(query("SELECT * FROM supabase_migrations.schema_migrations WHERE version = '20260902000004';"));
