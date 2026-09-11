import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  if (loginError) {
    console.log('Login failed:', loginError.message);
    // Maybe try fetching anyway if anon has access
  } else {
    console.log('Logged in as admin');
  }

  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, code, address, lat, lng, is_active, service_radius_km, manager_id');
    
  if (error) {
    console.error('Error fetching warehouses:', error);
    return;
  }
  
  console.log(JSON.stringify(data, null, 2));
}

run();
