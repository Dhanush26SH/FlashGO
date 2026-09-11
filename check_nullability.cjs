const { execSync } = require('child_process');

function query(sql) {
    try {
        let out = execSync(`npx supabase db query "${sql}" --linked`, { encoding: 'utf8', stdio: 'pipe' });
        let jsonMatch = out.substring(out.indexOf('{'));
        return JSON.parse(jsonMatch).rows;
    } catch(e) {
        return [{ error: e.message }];
    }
}

console.log(query("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'staff_shifts' AND column_name = 'warehouse_id';"));
