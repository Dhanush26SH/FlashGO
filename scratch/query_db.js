import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: 'flashgo-admin-test-v2@mailinator.com', password: 'password123' });
  if (authError) {
    console.error('Auth Error:', authError);
    return;
  }
  console.log('Logged in as:', authData.user.email);
  
  const { data, error } = await supabase
    .from('drop_zone_allocations')
    .select(`
      id,
      status,
      order_id,
      trip_id,
      picker_id,
      driver_id,
      placed_at,
      driver_assigned_at,
      picked_up_at,
      created_at,
      drop_zones(zone_code),
      orders(order_number, status),
      logistics_trips(status, driver_id)
    `)
    .in('drop_zones.zone_code', ['G1', 'G2', 'G3']);

  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const filtered = data.filter(d => d.drop_zones && ['G1', 'G2', 'G3'].includes(d.drop_zones.zone_code));
  
  console.log(JSON.stringify(filtered, null, 2));
}

run();
