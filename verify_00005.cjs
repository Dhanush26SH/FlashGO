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

console.log('--- 1. Check Migration History ---');
console.log(query("SELECT * FROM supabase_migrations.schema_migrations WHERE version = '20260902000005';"));

console.log('--- 2. Check notification helper hooks (e.g. process_checkout) ---');
console.log(query("SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('process_checkout', 'admin_resolve_ticket_and_refund', 'admin_assign_picker', 'mark_order_delivered', 'start_trip', 'create_logistics_trip', 'admin_cancel_order', 'admin_update_ticket_status')"));

console.log('--- 3. Direct client mutation protection ---');
console.log(query("SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.notifications'::regclass;"));
