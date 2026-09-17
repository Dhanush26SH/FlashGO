import { supabase } from './src/services/api/supabaseClient.js';
async function run() {
  const { data } = await supabase.from('profiles').select('id, full_name, role, employee_id, warehouse_id, status').in('role', ['picker', 'driver', 'warehouse_staff']);
  const eligible = data.filter(p => p.full_name && p.full_name.trim() !== '' && p.full_name.trim().toLowerCase() !== 'unknown' && p.employee_id && p.employee_id.trim() !== '' && p.employee_id.trim() !== '—' && p.employee_id.trim() !== '-' && (p.status === 'active' || p.status === 'approved') && (p.role === 'driver' ? true : !!p.warehouse_id));
  console.log('Genuine Roster Count: ' + eligible.length);
}
run();
