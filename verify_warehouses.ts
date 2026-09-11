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
  } else {
    console.log('Logged in as admin');
  }

  // 1. Query Warehouses
  const { data: warehouses, error: whError } = await supabase
    .from('warehouses')
    .select('id, name, lat, lng')
    .order('name');
    
  if (whError) {
    console.error('Error fetching warehouses:', whError);
  } else {
    console.log('WAREHOUSES:', JSON.stringify(warehouses, null, 2));
  }

  // 2. Call get_serving_warehouse for Udupi
  // Near Udupi Bus Stand: 13.3427, 74.74721
  const udupiLat = 13.3427;
  const udupiLng = 74.74721;
  const { data: udupiWhId, error: udupiError } = await supabase.rpc('get_serving_warehouse', {
    p_lat: udupiLat,
    p_lng: udupiLng
  });
  
  if (udupiError) {
    console.error('Error fetching Udupi warehouse:', udupiError);
  } else {
    const udupiMatch = warehouses?.find(w => w.id === udupiWhId);
    console.log(`Udupi test (${udupiLat}, ${udupiLng}) -> resolves to ID: ${udupiWhId} (${udupiMatch?.name})`);
  }

  // 3. Call get_serving_warehouse for Manipal
  // Near Manipal Bus Stand: 13.3516, 74.78665
  const manipalLat = 13.3516;
  const manipalLng = 74.78665;
  const { data: manipalWhId, error: manipalError } = await supabase.rpc('get_serving_warehouse', {
    p_lat: manipalLat,
    p_lng: manipalLng
  });

  if (manipalError) {
    console.error('Error fetching Manipal warehouse:', manipalError);
  } else {
    const manipalMatch = warehouses?.find(w => w.id === manipalWhId);
    console.log(`Manipal test (${manipalLat}, ${manipalLng}) -> resolves to ID: ${manipalWhId} (${manipalMatch?.name})`);
  }
}

run();
