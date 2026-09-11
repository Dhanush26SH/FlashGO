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

console.log('--- Check if public.promotions exists ---');
console.log(query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'promotions');"));

console.log('--- Check for promotion RPCs ---');
console.log(query("SELECT proname FROM pg_proc WHERE proname IN ('validate_promotion_target', 'admin_create_promotion', 'admin_update_promotion', 'admin_delete_promotion');"));
