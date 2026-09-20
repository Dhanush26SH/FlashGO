const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'driver')
    .limit(1)
    .single();

  if (!profile) return console.log('No driver found');
  console.log('Profile:', profile.id, 'Name:', profile.full_name, 'Role:', profile.role, 'Current Vehicle ID:', profile.current_vehicle_id);

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('owner_driver_id', profile.id);
  console.log('Vehicles:', JSON.stringify(vehicle, null, 2));

  const { data: compliance } = await supabase
    .from('driver_compliance')
    .select('*')
    .eq('driver_id', profile.id);
  console.log('Compliance:', JSON.stringify(compliance, null, 2));
}

check();
