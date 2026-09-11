const { execSync } = require('child_process');
try {
  let out = execSync(`npx supabase db query "SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'process_checkout'" --linked`, { encoding: 'utf8', stdio: 'pipe' });
  let jsonMatch = out.substring(out.indexOf('{'));
  let data = JSON.parse(jsonMatch);
  
  if (data.rows && data.rows.length > 0) {
      if (data.rows[0].pg_get_functiondef.includes('write_notification')) {
          console.log('PARTIAL APPLICATION HAPPENED');
      } else {
          console.log('NO 00005 PARTIAL APPLICATION (Old versions exist)');
      }
  } else {
      console.log('NO 00005 PARTIAL APPLICATION');
  }
} catch (e) {
  console.log('Error checking: ' + e.message);
}
