import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);

const results = {};
const log = (test, status, detail = '') => {
  results[test] = `${status}${detail ? ' — ' + detail : ''}`;
  console.log(`[${status}] ${test}${detail ? ': ' + detail : ''}`);
};

async function run() {
  const testOrderId = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';
  
  // 1. PRE-PACK INVARIANTS
  const { data: order } = await adminClient.from('orders').select('*').eq('id', testOrderId).single();
  const { data: orderItems } = await adminClient.from('order_items').select('*').eq('order_id', testOrderId);
  const { data: reservations } = await adminClient.from('inventory_reservations').select('*').eq('order_id', testOrderId);
  const { data: stockBefore } = await adminClient.from('warehouse_stock').select('*').eq('warehouse_id', order.warehouse_id).eq('product_id', orderItems[0].product_id).single();
  const { data: batchesBefore } = await adminClient.from('product_batches').select('*').eq('warehouse_id', order.warehouse_id).eq('product_id', orderItems[0].product_id);
  const { data: ledgersBefore } = await adminClient.from('stock_ledgers').select('*').eq('order_id', testOrderId);

  log('PRE_ORDER_STATUS', order?.status === 'waiting_for_packing' ? 'PASS' : 'FAIL', `status=${order?.status}`);
  log('PRE_RESERVATION_STATUS', reservations?.[0]?.status === 'consumed' ? 'PASS' : 'FAIL', `status=${reservations?.[0]?.status}`);
  
  // 2. WAREHOUSE STAFF AUTH
  const whEmail = 'new_wh_staff@flashgo.com';
  const whId = '71dfbbba-ceda-4ffa-8564-30351d52b714';
  
  const whClient = createClient(URL, ANON_KEY);
  const { error: signInErr } = await whClient.auth.signInWithPassword({ email: whEmail, password: 'TestPassword#999' });
  if (signInErr) { log('WH_AUTH', 'FAIL', signInErr.message); return; }
  log('WH_AUTH', 'PASS', `uid=${whId}`);

  const { data: profile } = await whClient.from('profiles').select('*').eq('id', whId).single();
  log('WH_ROLE_VERIFIED', profile?.role === 'warehouse_staff' ? 'PASS' : 'FAIL', `role=${profile?.role}`);

  // 3. WAITING FOR PACKING QUEUE
  const { data: queueOrders, error: queueErr } = await whClient.from('orders').select('*').eq('status', 'waiting_for_packing').eq('warehouse_id', profile.warehouse_id);
  const inQueue = queueOrders?.find(o => o.id === testOrderId);
  log('ORDER_IN_PACKING_QUEUE', inQueue ? 'PASS' : 'FAIL', queueErr?.message);

  // 4. START PACKING
  const { error: startPackErr } = await whClient.rpc('start_packing_order', { p_order_id: testOrderId, p_packer_id: whId });
  log('START_PACKING_RPC', !startPackErr ? 'PASS' : 'FAIL', startPackErr?.message);
  
  const { data: orderPacking } = await adminClient.from('orders').select('status').eq('id', testOrderId).single();
  log('STATUS_IS_PACKING', orderPacking?.status === 'packing' ? 'PASS' : 'FAIL', `status=${orderPacking?.status}`);

  // 5. COMPLETE PACKING
  const bagNumber = 'BAG-001';
  const { error: packErr } = await whClient.rpc('pack_order', { p_order_id: testOrderId, p_picker_id: whId, p_bag_number: bagNumber });
  log('COMPLETE_PACKING_RPC', !packErr ? 'PASS' : 'FAIL', packErr?.message);
  
  const { data: orderPacked } = await adminClient.from('orders').select('status, packing_status').eq('id', testOrderId).single();
  log('STATUS_IS_PACKED', orderPacked?.status === 'packed' ? 'PASS' : 'FAIL', `status=${orderPacked?.status}`);

  // 6. STAGING
  let locId = null;
  const { data: locs } = await adminClient.from('warehouse_staging_locations').select('id').eq('warehouse_id', order.warehouse_id).limit(1);
  if (locs?.length > 0) locId = locs[0].id;
  
  const { error: stageErr } = await whClient.rpc('stage_order', { p_order_id: testOrderId, p_location_id: locId, p_user_id: whId });
  log('STAGE_ORDER_RPC', !stageErr ? 'PASS' : 'FAIL', stageErr?.message);
  
  const { data: orderStaged } = await adminClient.from('orders').select('status').eq('id', testOrderId).single();
  log('STATUS_IS_STAGED', orderStaged?.status === 'staged' ? 'PASS' : 'FAIL', `status=${orderStaged?.status}`);

  // 8. SECURITY NEGATIVE TESTS
  // Pack order from another warehouse
  const { data: otherOrder } = await adminClient.from('orders').select('id').neq('warehouse_id', profile.warehouse_id).eq('status', 'waiting_for_packing').limit(1).single();
  if (otherOrder) {
    const { error: otherErr } = await whClient.rpc('start_packing_order', { p_order_id: otherOrder.id, p_packer_id: whId });
    log('SECURITY_OTHER_WH_PACK_BLOCKED', otherErr ? 'PASS' : 'FAIL');
  } else log('SECURITY_OTHER_WH_PACK_BLOCKED', 'SKIP', 'No other WH orders found');

  // Stage before packed (using another order)
  const { data: unpickedOrder } = await adminClient.from('orders').select('id').eq('status', 'placed').limit(1).single();
  if (unpickedOrder) {
    const { error: stageEarlyErr } = await whClient.rpc('stage_order', { p_order_id: unpickedOrder.id, p_location_id: locId, p_user_id: whId });
    log('SECURITY_EARLY_STAGE_BLOCKED', stageEarlyErr ? 'PASS' : 'FAIL', stageEarlyErr?.message);
  }

  // Change to delivered directly
  const { error: delivErr } = await whClient.from('orders').update({ status: 'delivered' }).eq('id', testOrderId);
  log('SECURITY_DELIVERED_UPDATE_BLOCKED', delivErr ? 'PASS' : 'FAIL', delivErr?.message);

  // 9. INVENTORY INVARIANTS (Compare before vs after)
  const { data: stockAfter } = await adminClient.from('warehouse_stock').select('*').eq('warehouse_id', order.warehouse_id).eq('product_id', orderItems[0].product_id).single();
  const { data: ledgersAfter } = await adminClient.from('stock_ledgers').select('*').eq('order_id', testOrderId);
  const { data: resAfter } = await adminClient.from('inventory_reservations').select('*').eq('order_id', testOrderId);
  
  log('INVARIANT_STOCK_UNCHANGED', stockBefore?.quantity === stockAfter?.quantity ? 'PASS' : 'FAIL', `before=${stockBefore?.quantity} after=${stockAfter?.quantity}`);
  log('INVARIANT_LEDGER_UNCHANGED', ledgersBefore?.length === ledgersAfter?.length ? 'PASS' : 'FAIL', `before=${ledgersBefore?.length} after=${ledgersAfter?.length}`);
  log('INVARIANT_RESERVATION_UNCHANGED', resAfter?.[0]?.status === 'consumed' && resAfter?.[0]?.quantity === 0 ? 'PASS' : 'FAIL');

  // 10. CUSTOMER REGRESSION
  const { data: customerOrder } = await adminClient.from('orders').select('*').eq('id', testOrderId).single();
  log('REGRESSION_UUID_SAME', customerOrder.id === testOrderId ? 'PASS' : 'FAIL');
  log('REGRESSION_TOTAL_UNCHANGED', customerOrder.total_amount == 175 ? 'PASS' : 'FAIL', `total=${customerOrder.total_amount}`);
  log('REGRESSION_PAYMENT_UNCHANGED', customerOrder.payment_method === 'cod' ? 'PASS' : 'FAIL');
  log('REGRESSION_STATUS', customerOrder.status === 'staged' ? 'PASS' : 'FAIL', `status=${customerOrder.status}`);

  console.log('\n\n========== WAREHOUSE PHASE VERIFICATION REPORT ==========');
  for (const [test, result] of Object.entries(results)) {
    const icon = result.startsWith('PASS') ? '✅' : result.startsWith('FAIL') ? '❌' : result.startsWith('SKIP') ? '⏭️' : '📋';
    console.log(`  ${icon} ${test}: ${result}`);
  }
}

run().catch(e => console.error(e));
