const { execSync } = require('child_process');
const fs = require('fs');
const funcs = [
  'admin_create_po', 
  'admin_update_po_status', 
  'receive_procurement_order', 
  'suspend_profile', 
  'unsuspend_profile', 
  'approve_staff_role', 
  'admin_update_staff_role', 
  'admin_update_staff_warehouse'
];

let result = '';
for (let f of funcs) {
  try {
    let out = execSync(`npx supabase db query "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '${f}'" --linked`, { encoding: 'utf8', stdio: 'pipe' });
    let jsonMatch = out.substring(out.indexOf('{'));
    let data = JSON.parse(jsonMatch);
    if (data.rows && data.rows.length > 0) {
      result += '-- ' + f + '\n' + data.rows[0].pg_get_functiondef + ';\n\n';
    }
  } catch(e) {
    console.log('Error fetching ' + f + ':', e.message);
  }
}
fs.writeFileSync('remote_funcs.sql', result);
console.log('Done fetching original functions.');
