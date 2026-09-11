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

console.log('--- Get Remote Functions ---');
let fns = query("SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('trg_notify_staff_shifts', 'reassign_trip');");
console.log(JSON.stringify(fns, null, 2));

console.log('--- Phase22B Event Keys ---');
// Wait, I can search the schema for Phase22B hooks using ripgrep locally, since all previous migrations are synced locally.
