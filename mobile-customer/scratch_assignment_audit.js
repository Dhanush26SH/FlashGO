const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('c:\\Users\\dhanu\\FlashGO\\.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@flashgo.com',
    password: 'password123'
  });
  if (authErr) {
    console.log("Login failed", authErr);
    return;
  }

  console.log("=== ORDER STATE ===");
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', '100fe2fc-5c62-4a22-83fb-adb9d01dc994')
    .single();
  if (orderErr) console.error(orderErr);
  else console.log(JSON.stringify(order, null, 2));

  console.log("\n=== ONLINE DRIVERS ===");
  const { data: drivers, error: drvErr } = await supabase
    .from('profiles')
    .select(`
      id, employee_id, full_name, role, warehouse_id, is_online,
      staff_shifts ( id, status, warehouse_id ),
      driver_sessions ( id, status, latest_lat, latest_lng )
    `)
    .eq('role', 'driver')
    .eq('is_online', true);
    
  if (drvErr) console.error(drvErr);
  else {
    const processed = drivers.map(d => ({
      id: d.id,
      employee_id: d.employee_id,
      full_name: d.full_name,
      warehouse_id: d.warehouse_id,
      is_online: d.is_online,
      active_shift: d.staff_shifts?.find(s => s.status === 'active'),
      active_session: d.driver_sessions?.find(s => s.status === 'active')
    }));
    console.log(JSON.stringify(processed, null, 2));
  }
}
run();
