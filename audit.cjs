const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function audit() {
  const tables = [
    'logistics_trips', 'product_batches', 'payment_transactions', 'refunds', 
    'cod_collections', 'driver_sessions', 'stock_ledgers', 'warehouse_stock', 'orders'
  ];
  
  console.log('--- TABLES ---');
  for (const table of tables) {
    const res = await supabase.from(table).select('*').limit(0);
    if (res.error) {
      console.log(`[FAIL] ${table}: ${res.error.code} - ${res.error.message}`);
    } else {
      console.log(`[OK]   ${table}`);
    }
  }

  const columns = {
    orders: ['trip_id', 'delivery_sequence', 'payment_status', 'payment_intent_id', 'payment_method'],
    stock_ledgers: ['batch_id']
  };

  console.log('\n--- COLUMNS ---');
  for (const [table, cols] of Object.entries(columns)) {
    for (const col of cols) {
      const res = await supabase.from(table).select(col).limit(0);
      if (res.error) {
        console.log(`[FAIL] ${table}.${col}: ${res.error.code} - ${res.error.message}`);
      } else {
        console.log(`[OK]   ${table}.${col}`);
      }
    }
  }

  const rpcs = [
    'create_logistics_trip', 'claim_trip', 'reassign_trip', 'mark_order_delivered',
    'process_checkout', 'process_refund', 'resolve_external_payment', 'pick_fefo_item',
    'receive_procurement_order'
  ];

  console.log('\n--- RPCs ---');
  for (const rpc of rpcs) {
    const res = await supabase.rpc(rpc);
    if (res.error && res.error.code === 'PGRST202' && res.error.message.includes('Could not find the function')) {
      console.log(`[FAIL] ${rpc}: Not found`);
    } else if (res.error) {
      console.log(`[EXISTS] ${rpc} (Returns: ${res.error.code} - ${res.error.message})`);
    } else {
      console.log(`[EXISTS] ${rpc}`);
    }
  }
}
audit();
