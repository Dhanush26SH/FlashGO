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
  
  // 1. PICKER AUTH
  const pickerEmail = 'flashgo-picker-b@maildrop.cc';
  const pickerClient = createClient(URL, ANON_KEY);
  
  // Create a fresh picker to ensure we have the password and can test suspension?
  // No, the order is ALREADY assigned to 573078ee-cb67-4d9a-84fa-bdbbdc33b561.
  // We don't know the password. We can reset it using Admin Client!
  const pickerId = '573078ee-cb67-4d9a-84fa-bdbbdc33b561';
  const { error: pwdErr } = await adminClient.auth.admin.updateUserById(pickerId, { password: 'TestPass#999' });
  if (pwdErr) { console.error("Could not reset picker password:", pwdErr); return; }
  
  const { data: signInData, error: signInErr } = await pickerClient.auth.signInWithPassword({
    email: pickerEmail, password: 'TestPass#999'
  });
  if (signInErr) { log('PICKER_AUTH', 'FAIL', signInErr.message); return; }
  log('PICKER_AUTH', 'PASS', `uid=${pickerId}`);

  // Check profile
  const { data: profile } = await pickerClient.from('profiles').select('*').eq('id', pickerId).single();
  log('PICKER_ROLE_VERIFIED', profile?.role === 'picker' ? 'PASS' : 'FAIL', `role=${profile?.role}`);
  
  // 3. TEST ORDER ASSIGNMENT
  // The order should be visible to this picker
  const { data: assignedOrders, error: getOrdersErr } = await pickerClient.from('orders').select('*').eq('picker_id', pickerId);
  const testOrder = assignedOrders?.find(o => o.id === testOrderId);
  log('ORDER_VISIBLE_TO_PICKER', testOrder ? 'PASS' : 'FAIL', getOrdersErr?.message || `status=${testOrder?.status}`);
  
  if (!testOrder) { console.error("Cannot proceed without order visibility"); return; }
  const warehouseId = testOrder.warehouse_id;

  // 4. RESERVATION BEFORE PICK
  // We need to capture state using Admin client to bypass any RLS for verification purposes
  const { data: orderItems } = await adminClient.from('order_items').select('*').eq('order_id', testOrderId);
  const { data: reservations } = await adminClient.from('inventory_reservations').select('*').eq('order_id', testOrderId);
  
  console.log("\n--- PRE-PICK STATE ---");
  let prePickState = {};
  for (const item of orderItems) {
    const { data: batches } = await adminClient.from('product_batches')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id)
      .order('expiry_date', { ascending: true });
      
    const { data: stock } = await adminClient.from('warehouse_stock')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id)
      .single();
      
    const { data: ledgers } = await adminClient.from('stock_ledgers')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id);
      
    prePickState[item.product_id] = { batches, stock, ledgers: ledgers?.length };
    console.log(`Product: ${item.product_id}, Stock: ${stock?.quantity}, Available Batches: ${batches?.length}, Ledgers: ${ledgers?.length}`);
  }

  // 4.5. START PICKING
  const { error: startPickErr } = await pickerClient.rpc('start_picking', { p_order_id: testOrderId, p_picker_id: pickerId });
  log('ORDER_TRANSITION_PICKING', !startPickErr ? 'PASS' : 'FAIL', startPickErr?.message);

  // 5. FEFO PICK
  console.log("\n--- EXECUTING FEFO PICK ---");
  for (const item of orderItems) {
    const pickPayload = {
      p_warehouse_id: warehouseId,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_order_id: testOrderId,
      p_user_id: pickerId
    };
    
    // Pick using Picker auth
    const { data: pickResult, error: pickErr } = await pickerClient.rpc('pick_fefo_item', pickPayload);
    log(`PICK_ITEM_${item.product_id}`, !pickErr ? 'PASS' : 'FAIL', pickErr?.message);
    
    // Check over-picking prevention (negative test)
    const { error: overPickErr } = await pickerClient.rpc('pick_fefo_item', pickPayload);
    log(`OVER_PICK_BLOCKED_${item.product_id}`, overPickErr ? 'PASS' : 'FAIL', overPickErr?.message);
  }

  // 6. POST-PICK STATE VERIFICATION
  console.log("\n--- POST-PICK STATE ---");
  let postPickState = {};
  for (const item of orderItems) {
    const { data: batchesAfter } = await adminClient.from('product_batches')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id)
      .order('expiry_date', { ascending: true });
      
    const { data: stockAfter } = await adminClient.from('warehouse_stock')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id)
      .single();
      
    const { data: ledgersAfter } = await adminClient.from('stock_ledgers')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('product_id', item.product_id)
      .order('created_at', { ascending: false })
      .limit(2);
      
    const preStock = prePickState[item.product_id].stock?.quantity || 0;
    const postStock = stockAfter?.quantity || 0;
    log(`STOCK_DECREMENTED_${item.product_id}`, postStock === preStock - item.quantity ? 'PASS' : 'FAIL', `before=${preStock} after=${postStock}`);
    
    const preLedgers = prePickState[item.product_id].ledgers || 0;
    // We expect one ledger entry per batch picked. Assuming 1 batch picked:
    log(`LEDGER_WRITTEN_${item.product_id}`, ledgersAfter?.length > preLedgers ? 'PASS' : 'FAIL');
    if (ledgersAfter?.length > 0) {
      log(`LEDGER_PROVENANCE_${item.product_id}`, ledgersAfter[0].order_id === testOrderId ? 'PASS' : 'FAIL', `ref=${ledgersAfter[0].order_id}`);
    }
  }

  const { data: resAfter } = await adminClient.from('inventory_reservations').select('*').eq('order_id', testOrderId);
  log('RESERVATION_CONSUMED', resAfter?.every(r => r.status === 'consumed') ? 'PASS' : 'FAIL', `status=${resAfter?.[0]?.status}`);

  // 7. PICK COMPLETION
  const { error: completeErr } = await pickerClient.rpc('complete_picking', { p_order_id: testOrderId, p_picker_id: pickerId });
  log('ORDER_TRANSITION_WAITING_FOR_PACKING', !completeErr ? 'PASS' : 'FAIL', completeErr?.message);

  // 8. SECURITY NEGATIVE TESTS
  // Picker cannot pick unassigned order
  const { data: otherOrder } = await adminClient.from('orders').select('id, warehouse_id').neq('picker_id', pickerId).limit(1).single();
  if (otherOrder) {
    const { error: unassignedPickErr } = await pickerClient.rpc('pick_fefo_item', {
      p_warehouse_id: otherOrder.warehouse_id, p_product_id: orderItems[0].product_id, p_quantity: 1, p_order_id: otherOrder.id, p_user_id: pickerId
    });
    log('SECURITY_UNASSIGNED_PICK_BLOCKED', unassignedPickErr ? 'PASS' : 'FAIL', unassignedPickErr?.message);
  }

  // Picker cannot change role
  const { error: roleUpdateErr } = await pickerClient.from('profiles').update({ role: 'admin' }).eq('id', pickerId);
  log('SECURITY_ROLE_ESCALATION_BLOCKED', roleUpdateErr ? 'PASS' : 'FAIL');

  // Picker cannot directly manipulate wallet
  const { error: walletErr } = await pickerClient.from('wallet_transactions').insert({
    user_id: pickerId, amount: 1000, type: 'credit', description: 'hack'
  });
  log('SECURITY_WALLET_MANIPULATION_BLOCKED', walletErr ? 'PASS' : 'FAIL');

  // 9. CUSTOMER REGRESSION
  const customerId = 'a22a3cc7-b33e-4da2-b3a4-e7b324aed74c';
  const { data: orderReg } = await adminClient.from('orders').select('*').eq('id', testOrderId).single();
  log('REGRESSION_ORDER_EXISTS', orderReg ? 'PASS' : 'FAIL');
  log('REGRESSION_ORDER_STATUS_UPDATED', orderReg?.status === 'waiting_for_packing' ? 'PASS' : 'FAIL', `status=${orderReg?.status}`);
  log('REGRESSION_PAYMENT_UNCHANGED', orderReg?.payment_method === 'cod' ? 'PASS' : 'FAIL');
  log('REGRESSION_TOTAL_UNCHANGED', orderReg?.total_amount == 175 ? 'PASS' : 'FAIL', `total=${orderReg?.total_amount}`);

  // PRINT SUMMARY
  console.log('\n\n========== PICKER PHASE VERIFICATION REPORT ==========');
  for (const [test, result] of Object.entries(results)) {
    const icon = result.startsWith('PASS') ? '✅' : result.startsWith('FAIL') ? '❌' : '📋';
    console.log(`  ${icon} ${test}: ${result}`);
  }
}

run().catch(e => console.error(e));
