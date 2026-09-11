const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('trg_notify_substitutions', 'trg_notify_staff_shifts', 'reassign_trip')" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  console.log(JSON.parse(jsonMatch).rows);
} catch (e) {
  console.log('Error checking: ' + e.message);
}
