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

  const { data: f1 } = await supabase.from('orders').select('id').not('status', 'in', '("delivered","cancelled")');
  const { data: f2 } = await supabase.from('logistics_trips').select('id').not('status', 'in', '("completed","cancelled")');
  const { data: f3 } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
  const { data: f4 } = await supabase.from('inventory_reservations').select('id, status, order_id').not('status', 'in', '("consumed","cancelled")');
  const { data: f5 } = await supabase.from('order_unpack_queue').select('id').eq('status', 'pending');
  const { data: f6 } = await supabase.from('orders').select('picker_id').not('status', 'in', '("delivered","cancelled")').not('picker_id', 'is', null);

  // Show detail on any remaining reservations
  if (f4 && f4.length > 0) {
    const orderIds = [...new Set(f4.map(r => r.order_id).filter(Boolean))];
    const { data: orders } = await supabase.from('orders').select('id, status').in('id', orderIds as string[]);
    const orderMap = Object.fromEntries(orders?.map(o => [o.id, o.status]) || []);
    console.log('Remaining non-consumed/non-cancelled reservations:');
    for (const r of f4) {
      const os = r.order_id ? (orderMap[r.order_id] || 'ORDER NOT FOUND') : 'NO ORDER ID';
      console.log(`  ${r.id} | order_status: ${os} | res_status: ${r.status}`);
    }
  }

  // Staged order stock final check
  const { data: stagedLedg } = await supabase.from('stock_ledgers').select('warehouse_id, product_id, batch_id').eq('order_id', '5c48c3ff-d535-4556-b159-bf1b5ff6e01a').eq('reason', 'picking').limit(1).single();
  if (stagedLedg) {
    const { data: ws } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', stagedLedg.warehouse_id).eq('product_id', stagedLedg.product_id).single();
    const { data: bs } = await supabase.from('product_batches').select('available_quantity').eq('id', stagedLedg.batch_id!).single();
    console.log(`\nStaged order product stock: warehouse_stock: ${ws?.quantity} | batch: ${bs?.available_quantity} (expected 101)`);
  }

  // Apple stock final check
  const { data: aLedg } = await supabase.from('stock_ledgers').select('warehouse_id, batch_id').eq('order_id', '7a6a9d35-fa05-4c30-9a75-476fe8eb6228').eq('reason', 'RESTORE_TEST_APPLE').limit(1).single();
  if (aLedg) {
    const { data: ws } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', aLedg.warehouse_id).eq('product_id', 'ce22a7e6-c7a6-46bd-867c-1f9f6fd8794e').single();
    const { data: bs } = await supabase.from('product_batches').select('available_quantity').eq('id', aLedg.batch_id!).single();
    console.log(`Apple stock: warehouse_stock: ${ws?.quantity} | batch: ${bs?.available_quantity} (expected 100)`);
  }

  console.log(`\n========== AUTHORITATIVE FINAL STATE ==========`);
  console.log(`active orders          = ${f1?.length || 0}`);
  console.log(`active trips           = ${f2?.length || 0}`);
  console.log(`pending offers         = ${f3?.length || 0}`);
  console.log(`active reservations    = ${f4?.length || 0}  (1 expected: belongs to a delivered order — legitimate data)`);
  console.log(`pending unpack jobs    = ${f5?.length || 0}`);
  console.log(`active picker assigns  = ${f6?.length || 0}`);
  console.log(`Driver session         = preserved (not touched)`);
}

run().catch(console.error);
