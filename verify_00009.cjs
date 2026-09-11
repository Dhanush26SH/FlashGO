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

console.log('--- Check 00009 Migration History ---');
console.log(query("SELECT * FROM supabase_migrations.schema_migrations WHERE version = '20260902000009';"));

console.log('--- Check Phase24 RPCs ---');
console.log(query("SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('get_product_performance', 'get_delivery_performance', 'get_financial_ledger_export');"));
