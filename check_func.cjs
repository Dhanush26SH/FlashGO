const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'admin_update_ticket_status'" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  console.log(JSON.parse(jsonMatch).rows[0].pg_get_functiondef);
} catch (e) {
  console.log('Error checking: ' + e.message);
}
