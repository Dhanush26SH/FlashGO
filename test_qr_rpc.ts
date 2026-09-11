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
    return;
  }
  console.log('Logged in as admin');

  const { data: warehouses, error: whError } = await supabase
    .from('warehouses')
    .select('id, name')
    .ilike('name', '%Udupi%')
    .limit(1);

  if (whError || !warehouses || warehouses.length === 0) {
    console.error('Error fetching Udupi warehouse:', whError);
    return;
  }

  const udupiWhId = warehouses[0].id;
  console.log('Testing against Warehouse:', warehouses[0].name, udupiWhId);

  console.log('\n--- Test 1: First Call ---');
  const { data: token1, error: err1 } = await supabase.rpc('get_or_create_current_warehouse_qr', {
    p_warehouse_id: udupiWhId
  });
  if (err1) {
    console.error('Error 1:', err1);
    return;
  }
  console.log('Token 1:', token1);

  console.log('\n--- Test 2: Immediate Second Call ---');
  const { data: token2, error: err2 } = await supabase.rpc('get_or_create_current_warehouse_qr', {
    p_warehouse_id: udupiWhId
  });
  if (err2) {
    console.error('Error 2:', err2);
    return;
  }
  console.log('Token 2:', token2);
  console.log('Match?', token1 === token2);

}

run();
