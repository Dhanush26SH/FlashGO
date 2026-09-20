const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: drivers } = await supabase
    .from('profiles')
    .select('id, full_name, warehouse_id')
    .eq('role', 'driver')
    .not('warehouse_id', 'is', null);

  for (const d of drivers) {
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, status, warehouse_id')
      .eq('owner_driver_id', d.id)
      .eq('ownership_type', 'driver_owned')
      .eq('status', 'pending')
      .is('warehouse_id', null);

    if (vehicles && vehicles.length > 0) {
      console.log(`Driver ${d.full_name} (${d.id}) has ${vehicles.length} pending vehicles with null warehouse:`);
      console.log(vehicles);
    }
  }
}

check();
