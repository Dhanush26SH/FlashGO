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

  console.log('--- Active Orders (not delivered/cancelled) ---');
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('id, status, picker_id')
    .not('status', 'in', '("delivered","cancelled")');
  console.log('Count:', orders?.length);
  console.log(JSON.stringify(orders, null, 2));

  console.log('\n--- Active Reservations (not consumed/cancelled) ---');
  const { data: reservations, error: rErr } = await supabase
    .from('inventory_reservations')
    .select('id, status, order_id, product_id')
    .not('status', 'in', '("consumed","cancelled")');
  console.log('Count:', reservations?.length);
  console.log(JSON.stringify(reservations?.slice(0, 5), null, 2), '...');

  console.log('\n--- Unpack Queue ---');
  const { data: uq } = await supabase
    .from('order_unpack_queue')
    .select('id, order_id, status');
  console.log(JSON.stringify(uq, null, 2));

  console.log('\n--- Staged Order Ledgers (post-cancel) ---');
  const { data: stgLedg } = await supabase
    .from('stock_ledgers')
    .select('reason, quantity_change')
    .eq('order_id', '5c48c3ff-d535-4556-b159-bf1b5ff6e01a');
  console.log(JSON.stringify(stgLedg, null, 2));

  // Check what admin_cancel_order signature looks like by testing on one of the remaining active orders
  console.log('\n--- admin_cancel_order RPC test ---');
  const remaining = orders?.find(o => !['placed_zero'].includes(o.status));
  if (remaining) {
    const { data, error } = await supabase.rpc('admin_cancel_order', { p_order_id: remaining.id, p_reason: 'TEST CLEANUP' });
    console.log('RPC result:', data, 'Error:', JSON.stringify(error));
  }
}

run().catch(console.error);
