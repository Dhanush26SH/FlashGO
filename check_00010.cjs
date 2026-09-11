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

console.log('--- Payment Statuses ---');
console.log(query("SELECT status, count(*) FROM public.payment_transactions GROUP BY status ORDER BY status;"));

console.log('--- Constraints ---');
console.log(query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.payment_transactions'::regclass;"));

console.log('--- Refund Logic in Phase21 ---');
console.log(query("SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('admin_resolve_ticket_and_refund');"));
