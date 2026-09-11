const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT DISTINCT status FROM payment_transactions" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  console.log(JSON.parse(jsonMatch).rows);
} catch (e) {
  console.log('Error: ' + e.message);
}
