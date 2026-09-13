import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// The 4 orders that survived due to the 2-arg admin_cancel_order resolving to the wrong overload.
// The 1-arg overload (20260916000039) is the safe one with no process_refund call.
const REMAINING_ORDERS = [
  '73401c96-ea3e-4792-a97b-96f0d03657b5',
  'fff549bc-a8a7-4aba-815f-d16960717cb7',
  '1d126d17-cbc6-4a07-a5b4-87cbd45ca0e1',
  'a5bd12fe-9b03-478a-9205-e3c41bd289cb',
];

// Staged order also needs to be cancelled (was part of original 22 but may still be active if the first round failed too)
const STAGED_ORDER_ID = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';

async function run() {
  console.log('Starting TARGETED COMPLETION cleanup...\n');

  const { error: authErr, data: authData } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });
  if (authErr) throw authErr;
  const adminId = authData.user.id;

  // Step 1: Cancel all remaining active orders using 1-arg RPC
  console.log('--- 1. Cancelling Remaining Active Orders (1-arg RPC) ---');
  const { data: activeOrders } = await supabase
    .from('orders')
    .select('id, status')
    .not('status', 'in', '("delivered","cancelled")');
  
  for (const o of activeOrders || []) {
    console.log(`Cancelling order: ${o.id} (status: ${o.status})`);
    const { error } = await supabase.rpc('admin_cancel_order', { p_order_id: o.id });
    if (error) {
      console.log(`  ERROR: ${JSON.stringify(error)}`);
    } else {
      console.log(`  SUCCESS`);
    }
  }

  // Step 2: Process any unpack queue jobs (staged order should create one on cancel)
  console.log('\n--- 2. Processing Unpack Queue ---');
  const { data: unpacks } = await supabase.from('order_unpack_queue').select('id, order_id, status').eq('status', 'pending');
  console.log(`Pending unpack jobs: ${unpacks?.length || 0}`);
  for (const u of unpacks || []) {
    console.log(`Processing unpack: ${u.id} for order ${u.order_id}`);
    const { error } = await supabase.rpc('process_order_unpack', {
      p_unpack_id: u.id,
      p_disposition: 'restocked',
      p_user_id: adminId
    });
    if (error) {
      console.log(`  ERROR: ${JSON.stringify(error)}`);
    } else {
      console.log(`  SUCCESS`);
    }
  }

  // Step 3: Cancel any remaining active trips
  console.log('\n--- 3. Cancelling Remaining Active Trips ---');
  const { data: activeTrips } = await supabase.from('logistics_trips').select('id, status').not('status', 'in', '("completed","cancelled")');
  console.log(`Active trips: ${activeTrips?.length || 0}`);
  for (const t of activeTrips || []) {
    await supabase.from('logistics_trips').update({ status: 'cancelled' }).eq('id', t.id);
    console.log(`  Cancelled trip: ${t.id}`);
  }

  // Step 4: Reject remaining pending offers
  console.log('\n--- 4. Rejecting Pending Offers ---');
  const { data: offers } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
  for (const f of offers || []) {
    await supabase.from('driver_trip_offers').update({ status: 'rejected' }).eq('id', f.id);
    console.log(`  Rejected offer: ${f.id}`);
  }

  // Step 5: Final verification
  console.log('\n--- FINAL VERIFICATION ---');
  const { data: finalOrders } = await supabase.from('orders').select('id').not('status', 'in', '("delivered","cancelled")');
  const { data: finalTrips } = await supabase.from('logistics_trips').select('id').not('status', 'in', '("completed","cancelled")');
  const { data: finalOffers } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
  const { data: finalReservations } = await supabase.from('inventory_reservations').select('id').not('status', 'in', '("consumed","cancelled")');
  const { data: finalUnpacks } = await supabase.from('order_unpack_queue').select('id').eq('status', 'pending');
  const { data: finalPickerOrders } = await supabase.from('orders').select('picker_id').not('status', 'in', '("delivered","cancelled")').not('picker_id', 'is', null);

  // Check staged order stock after unpack
  const { data: stagedLedg } = await supabase.from('stock_ledgers').select('warehouse_id, product_id, batch_id').eq('order_id', STAGED_ORDER_ID).eq('reason', 'picking').limit(1).single();
  let stagedStockAfter = null;
  if (stagedLedg) {
    const { data: ws } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', stagedLedg.warehouse_id).eq('product_id', stagedLedg.product_id).single();
    const { data: bs } = await supabase.from('product_batches').select('available_quantity').eq('id', stagedLedg.batch_id).single();
    stagedStockAfter = { warehouse_stock: ws?.quantity, batch: bs?.available_quantity };
  }

  console.log(`active orders          = ${finalOrders?.length || 0}`);
  console.log(`active trips           = ${finalTrips?.length || 0}`);
  console.log(`pending offers         = ${finalOffers?.length || 0}`);
  console.log(`active reservations    = ${finalReservations?.length || 0}`);
  console.log(`pending unpack jobs    = ${finalUnpacks?.length || 0}`);
  console.log(`active picker assigns  = ${finalPickerOrders?.length || 0}`);
  console.log(`Driver session         = preserved (not touched)`);
  
  if (stagedStockAfter) {
    console.log(`\nStaged order post-unpack: warehouse_stock: ${stagedStockAfter.warehouse_stock}, batch: ${stagedStockAfter.batch}`);
    console.log(`(Expected: 98+3=101 warehouse_stock, 98+3=101 batch)`);
  }
}

run().catch(console.error);
