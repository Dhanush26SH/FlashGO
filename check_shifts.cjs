const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff_shifts'" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  console.log(JSON.parse(jsonMatch).rows);
} catch (e) {
  console.log('Error checking: ' + e.message);
}
