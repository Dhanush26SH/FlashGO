import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  const { data: warehouses } = await supabase.from('warehouses').select('*');
  console.log('--- WAREHOUSES ---');
  console.log(JSON.stringify(warehouses, null, 2));

  const { data: profiles } = await supabase.from('profiles')
    .select('id, full_name, role, warehouse_id, current_vehicle_id, employee_id')
    .in('full_name', ['Driver1', 'Sudarshan', 'Warehousestaff1', 'Bob']);
  console.log('--- TARGET PROFILES ---');
  console.log(JSON.stringify(profiles, null, 2));

  const { data: vehicles } = await supabase.from('vehicles')
    .select('*')
    .eq('license_plate', 'KA-20-FLASH-01');
  console.log('--- TARGET VEHICLE ---');
  console.log(JSON.stringify(vehicles, null, 2));
}

run();
