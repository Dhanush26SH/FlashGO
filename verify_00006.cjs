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

console.log('--- 1. Check Migration History for 00006 ---');
console.log(query("SELECT * FROM supabase_migrations.schema_migrations WHERE version = '20260902000006';"));

console.log('--- 2. Check 00006 updated RPCs ---');
console.log(query("SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('trg_notify_substitutions', 'trg_notify_staff_shifts', 'reassign_trip')"));
