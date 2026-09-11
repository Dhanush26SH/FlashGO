const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'process_checkout' OR proname = 'create_logistics_trip'" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  let data = JSON.parse(jsonMatch);
  
  if (data.rows && data.rows.length > 0) {
      console.log('Found functions:');
      data.rows.forEach(r => console.log(r.proname));
  } else {
      console.log('NO 00005 PARTIAL APPLICATION');
  }
} catch (e) {
  console.log('NO 00005 PARTIAL APPLICATION');
}
