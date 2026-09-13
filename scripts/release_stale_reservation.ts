import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DELIVERED_ORDER_ID = 'bdb65791-2c7d-4a51-8cc4-b79f3f23457c';

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  // 1. Inspect current state of the stale reservation
  const { data: before } = await supabase
    .from('inventory_reservations')
    .select('id, status, order_id, product_id, quantity')
    .eq('order_id', DELIVERED_ORDER_ID);
  console.log('Before:', JSON.stringify(before, null, 2));

  // 2. Apply release_order_reservations via direct UPDATE (same logic as the RPC)
  //    The deployed function does: UPDATE ... SET status = 'released' WHERE order_id = ? AND status = 'reserved'
  //    No stock mutation — reservation was never physically consumed.
  const { error } = await supabase
    .from('inventory_reservations')
    .update({ status: 'released' })
    .eq('order_id', DELIVERED_ORDER_ID)
    .eq('status', 'reserved');

  if (error) {
    console.error('Release failed:', JSON.stringify(error));
    process.exit(1);
  }

  const { data: after } = await supabase
    .from('inventory_reservations')
    .select('id, status, order_id')
    .eq('order_id', DELIVERED_ORDER_ID);
  console.log('After:', JSON.stringify(after, null, 2));

  // 3. Final authoritative counts — active = only 'reserved' status
  const { data: activeOrders } = await supabase.from('orders').select('id').not('status', 'in', '("delivered","cancelled")');
  const { data: activeTrips } = await supabase.from('logistics_trips').select('id').not('status', 'in', '("completed","cancelled")');
  const { data: pendingOffers } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
  const { data: pendingUnpacks } = await supabase.from('order_unpack_queue').select('id').eq('status', 'pending');
  const { data: activePickers } = await supabase.from('orders').select('picker_id').not('status', 'in', '("delivered","cancelled")').not('picker_id', 'is', null);
  const { data: activeReservations } = await supabase.from('inventory_reservations').select('id').eq('status', 'reserved');

  console.log('\n========== AUTHORITATIVE FINAL STATE ==========');
  console.log(`active orders          = ${activeOrders?.length || 0}`);
  console.log(`active trips           = ${activeTrips?.length || 0}`);
  console.log(`pending offers         = ${pendingOffers?.length || 0}`);
  console.log(`pending unpack jobs    = ${pendingUnpacks?.length || 0}`);
  console.log(`active picker assigns  = ${activePickers?.length || 0}`);
  console.log(`active reservations    = ${activeReservations?.length || 0}  (only 'reserved' status counted)`);
  console.log(`Driver session         = preserved (not touched)`);
}

run().catch(console.error);
