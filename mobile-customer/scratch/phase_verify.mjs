// Full phase verification — all 3 blockers + security regression + COD test
import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);
const results = {};
let testUID = null;
let testOrderId = null;
let testAddressId = null;
let testTicketId = null;

const log = (test, status, detail = '') => {
  results[test] = `${status}${detail ? ' — ' + detail : ''}`;
  console.log(`[${status}] ${test}${detail ? ': ' + detail : ''}`);
};

async function run() {
  // ===== SETUP =====
  const testEmail = `phase_verify_${Date.now()}@flashgo-test.dev`;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: testEmail, password: 'TestPass#999', email_confirm: true
  });
  if (createErr) { console.error('SETUP FAIL:', createErr.message); return; }
  testUID = created.user.id;
  await adminClient.from('profiles').insert({
    id: testUID, role: 'customer', full_name: 'Phase Verify Customer', phone: '9876543210'
  });
  console.log(`Test user created: ${testUID}`);

  const custClient = createClient(URL, ANON_KEY);
  const { data: signInData, error: signInErr } = await custClient.auth.signInWithPassword({
    email: testEmail, password: 'TestPass#999'
  });
  if (signInErr) { log('AUTH', 'FAIL', signInErr.message); return; }
  log('AUTH', 'PASS', `uid=${testUID}`);

  // ===== PHASE 3: ADDRESS =====
  // Get warehouse to test serviceability
  const { data: warehouseId } = await custClient.rpc('get_serving_warehouse', { p_lat: 13.3427, p_lng: 74.7472 });
  log('SERVICEABILITY_UDUPI', warehouseId ? 'PASS' : 'FAIL', `warehouse=${warehouseId}`);

  // Create address with customer_id (the fix)
  const { data: newAddr, error: addrErr } = await custClient.from('customer_addresses').insert({
    customer_id: testUID,   // The FIX: RLS requires this to equal auth.uid()
    label: 'Test Home',
    address_line: '12 Manipal Road, Udupi, Karnataka',
    street_address: '12 Manipal Road',
    city: 'Udupi',
    locality: 'Manipal',
    lat: 13.3427,
    lng: 74.7472,
    is_default: true
  }).select().single();
  log('ADDRESS_CREATE', !addrErr ? 'PASS' : 'FAIL', addrErr?.message || `id=${newAddr?.id}`);
  if (newAddr) testAddressId = newAddr.id;

  // Read own addresses
  const { data: ownAddrs, error: readAddrErr } = await custClient.from('customer_addresses').select('*');
  log('ADDRESS_READ_OWN', !readAddrErr ? 'PASS' : 'FAIL', `count=${ownAddrs?.length}`);

  // Cross-user address blocked
  const { data: othersAddr } = await custClient.from('customer_addresses').select('id').neq('customer_id', testUID).limit(1);
  log('ADDRESS_CROSS_USER_BLOCKED', (!othersAddr || othersAddr.length === 0) ? 'PASS' : 'FAIL — DATA LEAK');

  // ===== PHASE 2: CHECKOUT =====
  // Get catalog for the warehouse
  const { data: catalog } = await custClient.rpc('get_warehouse_catalog', {
    p_warehouse_id: warehouseId,
    p_search_query: null
  });
  // Catalog returns product_id (not id) — the app's fetchWarehouseCatalog remaps this
  const firstProduct = catalog?.[0];
  const productId = firstProduct?.product_id; // use product_id field directly
  log('WAREHOUSE_CATALOG', firstProduct ? 'PASS' : 'FAIL', `count=${catalog?.length}, first_product_id=${productId}`);

  // Snapshot stock BEFORE checkout
  let stockBefore = null;
  if (productId) {
    const { data: stockSnap } = await adminClient.from('warehouse_stock').select('quantity').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
    stockBefore = stockSnap;
    log('STOCK_BEFORE', 'INFO', `qty=${stockSnap?.quantity}`);
  }

  // Orders count BEFORE
  const { data: ordersBefore } = await custClient.from('orders').select('id').eq('customer_id', testUID);
  log('ORDERS_BEFORE', 'INFO', `count=${ordersBefore?.length}`);

  // Perform COD checkout with CORRECT signature (the fix)
  const idempotencyKey = `${testUID}_${Date.now()}`;
  const checkoutPayload = {
    p_user_id: testUID,
    p_address: '12 Manipal Road, Udupi, Karnataka',
    p_delivery_speed: 'standard',
    p_payment_method: 'cod',
    // camelCase productId key — matches the RPC's jsonb_to_recordset pattern (the fix)
    p_items: [{ productId: productId, quantity: 1 }],
    p_coupon_code: null,
    p_lat: 13.3427,
    p_lng: 74.7472,
    p_idempotency_key: idempotencyKey,
  };
  const { data: orderId, error: checkoutErr } = await custClient.rpc('process_checkout', checkoutPayload);
  log('CHECKOUT_COD', !checkoutErr && orderId ? 'PASS' : 'FAIL', checkoutErr?.message || `orderId=${orderId}`);
  testOrderId = orderId;

  // Verify order details
  if (orderId) {
    const { data: order } = await adminClient.from('orders').select('*, order_items(*)').eq('id', orderId).single();
    log('ORDER_BELONGS_TO_CUSTOMER', order?.customer_id === testUID ? 'PASS' : 'FAIL');
    log('ORDER_PAYMENT_COD', order?.payment_method === 'cod' ? 'PASS' : 'FAIL', `method=${order?.payment_method}`);
    log('ORDER_STATUS_PLACED', order?.status === 'placed' ? 'PASS' : 'FAIL', `status=${order?.status}`);
    log('ORDER_ITEMS_CREATED', order?.order_items?.length > 0 ? 'PASS' : 'FAIL', `items=${order?.order_items?.length}`);
    log('ORDER_AMOUNT', 'INFO', `total=₹${order?.total_amount} delivery=₹${order?.delivery_fee} discount=₹${order?.discount_amount}`);
    log('ORDER_WAREHOUSE_ADDRESS', 'INFO', `addr=${order?.delivery_address}`);
    
    // Verify item price is server-authoritative (should match products table)
    const item = order?.order_items?.[0];
    const { data: productRow } = await adminClient.from('products').select('price, discount_price').eq('id', productId).single();
    const expectedPrice = productRow?.discount_price || productRow?.price;
    log('PRICE_SERVER_AUTHORITATIVE', Math.abs(item?.price - expectedPrice) < 0.01 ? 'PASS' : 'FAIL', `item_price=${item?.price} expected=${expectedPrice}`);
  }

  // Verify reservation created
  if (orderId && productId) {
    const { data: reservation } = await adminClient.from('inventory_reservations').select('quantity').eq('order_id', orderId).eq('product_id', productId).single();
    log('RESERVATION_CREATED', reservation ? 'PASS' : 'FAIL', `qty=${reservation?.quantity}`);

    // Stock AFTER: physical stock unchanged
    const { data: stockAfter } = await adminClient.from('warehouse_stock').select('quantity').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
    log('PHYSICAL_STOCK_UNCHANGED', stockAfter?.quantity === stockBefore?.quantity ? 'PASS' : 'FAIL', `before=${stockBefore?.quantity} after=${stockAfter?.quantity}`);
  }

  // Order appears in own history
  const { data: ordersAfter } = await custClient.from('orders').select('id, status, payment_method').eq('customer_id', testUID);
  log('ORDER_IN_HISTORY', ordersAfter?.find(o => o.id === orderId) ? 'PASS' : 'FAIL', `count=${ordersAfter?.length}`);

  // ===== PHASE 4: SUPPORT TICKETS =====
  const { data: ticket, error: ticketErr } = await custClient.from('support_tickets').insert({
    customer_id: testUID,   // The FIX
    subject: 'Phase Verify Test Ticket',
    description: 'Automated regression test ticket.',
    category: 'Other',     // The FIX: was 'general', now valid enum value
    priority: 'low',       // The FIX: was missing
    status: 'open',
  }).select().single();
  log('SUPPORT_TICKET_CREATE', !ticketErr ? 'PASS' : 'FAIL', ticketErr?.message || `id=${ticket?.id}`);
  if (ticket) testTicketId = ticket.id;

  // Read own ticket
  const { data: ownTickets } = await custClient.from('support_tickets').select('*').eq('customer_id', testUID);
  log('SUPPORT_READ_OWN', ownTickets?.length > 0 ? 'PASS' : 'FAIL', `count=${ownTickets?.length}`);

  // Cross-user ticket blocked
  const { data: othersTickets } = await custClient.from('support_tickets').select('id').neq('customer_id', testUID).limit(1);
  log('SUPPORT_CROSS_USER_BLOCKED', (!othersTickets || othersTickets.length === 0) ? 'PASS' : 'FAIL — DATA LEAK');

  // ===== PHASE 8: SECURITY REGRESSION =====
  const { error: roleWriteErr } = await custClient.from('profiles').update({ role: 'admin' }).eq('id', testUID);
  log('SECURITY_CANNOT_WRITE_ROLE', roleWriteErr ? 'PASS' : 'FAIL');

  const { error: whWriteErr } = await custClient.from('profiles').update({ warehouse_id: '00000000-0000-0000-0000-000000000000' }).eq('id', testUID);
  log('SECURITY_CANNOT_WRITE_WAREHOUSE', whWriteErr ? 'PASS' : 'FAIL');

  const { error: suspendWriteErr } = await custClient.from('profiles').update({ is_suspended: true }).eq('id', testUID);
  log('SECURITY_CANNOT_WRITE_SUSPENDED', suspendWriteErr ? 'PASS' : 'FAIL');

  const { error: walletInsertErr } = await custClient.from('wallet_transactions').insert({ user_id: testUID, amount: 500, type: 'credit', description: 'hack' });
  log('SECURITY_WALLET_INSERT_BLOCKED', walletInsertErr ? 'PASS' : 'FAIL');

  const { data: othersProfile } = await custClient.from('profiles').select('id').neq('id', testUID).limit(1);
  log('SECURITY_CANNOT_READ_OTHERS_PROFILE', (!othersProfile || othersProfile.length === 0) ? 'PASS' : 'FAIL');

  const { data: othersOrders } = await custClient.from('orders').select('id, customer_id').neq('customer_id', testUID).limit(1);
  log('SECURITY_CANNOT_READ_OTHERS_ORDERS', (!othersOrders || othersOrders.length === 0) ? 'PASS' : 'FAIL');

  // ===== CLEANUP =====
  await adminClient.auth.admin.deleteUser(testUID);
  console.log(`Test user ${testUID} deleted.`);

  // ===== FINAL REPORT =====
  console.log('\n\n========== PHASE VERIFICATION REPORT ==========');
  for (const [test, result] of Object.entries(results)) {
    const icon = result.startsWith('PASS') ? '✅' : result.startsWith('FAIL') ? '❌' : '📋';
    console.log(`  ${icon} ${test}: ${result}`);
  }
  console.log('\n--- KEY ARTIFACTS ---');
  if (testOrderId) console.log(`  🧾 TEST ORDER ID: ${testOrderId}`);
  if (testAddressId) console.log(`  📍 TEST ADDRESS ID: ${testAddressId}`);
  if (testTicketId) console.log(`  🎫 TEST TICKET ID: ${testTicketId}`);
  
  const failures = Object.entries(results).filter(([, v]) => v.startsWith('FAIL'));
  if (failures.length === 0) {
    console.log('\n  🟢 ALL TESTS PASSED — All 3 blockers resolved.');
  } else {
    console.log(`\n  🔴 ${failures.length} FAILURE(S):`);
    failures.forEach(([k, v]) => console.log(`    - ${k}: ${v}`));
  }
}

run().catch(e => console.error('FATAL:', e.message));
