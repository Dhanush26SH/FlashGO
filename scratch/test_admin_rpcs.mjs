import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const adminClient = createClient(SUPABASE_URL, ANON_KEY);

async function run() {
  const adminAuth = await adminClient.auth.signInWithPassword({ email: 'admin123@flashgo.com', password: 'Test1234!' });
  if (adminAuth.error) return console.error(adminAuth.error);

  const { data: whData } = await adminClient.from('warehouses').select('id').limit(1);
  const whId = whData[0].id;
  
  console.log('--- Inventory ---');
  const inv = await adminClient.rpc('admin_get_warehouse_inventory', { p_warehouse_id: whId });
  console.log(inv.data?.slice(0,2), inv.error);

  console.log('\n--- Ledgers ---');
  const led = await adminClient.rpc('admin_get_stock_ledgers', { p_warehouse_id: whId });
  console.log(led.data?.slice(0,2), led.error);

  console.log('\n--- Batches ---');
  const bat = await adminClient.rpc('admin_get_product_batches', { p_warehouse_id: whId });
  console.log(bat.data?.slice(0,2), bat.error);
}

run();
