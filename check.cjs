const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function test() {
  const checks = [
    { type: 'table', name: 'customer_addresses' },
    { type: 'table', name: 'order_substitutions' },
    { type: 'column', table: 'orders', name: 'inventory_deducted' },
    { type: 'column', table: 'orders', name: 'payment_method' },
    { type: 'rpc', name: 'deduct_inventory_for_order' },
    { type: 'table', name: 'cod_collections' }
  ];

  for (const check of checks) {
    if (check.type === 'table') {
      const res = await supabase.from(check.name).select('*').limit(0);
      console.log(`${check.name}: ${res.error ? 'MISSING' : 'EXISTS'}`);
    } else if (check.type === 'column') {
      const res = await supabase.from(check.table).select(check.name).limit(0);
      console.log(`${check.table}.${check.name}: ${res.error ? 'MISSING' : 'EXISTS'}`);
    } else if (check.type === 'rpc') {
      const res = await supabase.rpc(check.name);
      const isMissing = res.error && res.error.code === 'PGRST202' && res.error.message.includes('Could not find the function');
      console.log(`${check.name}: ${isMissing ? 'MISSING' : 'EXISTS'}`);
    }
  }
}
test();
