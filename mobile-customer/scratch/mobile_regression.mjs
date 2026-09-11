// Comprehensive API-level regression test for mobile-customer Supabase flows
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient('https://szpfuommfvrfdliloxcg.supabase.co', SERVICE_KEY);

const results = {};
const log = (test, status, detail = '') => {
  results[test] = `${status}${detail ? ' — ' + detail : ''}`;
  console.log(`[${status}] ${test}${detail ? ': ' + detail : ''}`);
};

async function run() {
  // ===== SETUP: Create test customer =====
  const testEmail = `mobile_regression_${Date.now()}@flashgo-test.dev`;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: testEmail, password: 'TestPass#999', email_confirm: true
  });
  if (createErr) { log('SETUP', 'FAIL', createErr.message); return; }
  const uid = created.user.id;
  await adminClient.from('profiles').insert({
    id: uid, role: 'customer', full_name: 'Mobile Regression Test', phone: '9876543210'
  });

  // Create client signed in as customer
  const custClient = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');
  const { data: signInData, error: signInErr } = await custClient.auth.signInWithPassword({ email: testEmail, password: 'TestPass#999' });
  if (signInErr) { log('AUTH_SIGNIN', 'FAIL', signInErr.message); return; }
  log('AUTH_SIGNIN', 'PASS', `uid=${uid}`);

  // ===== 1. PROFILE RLS =====
  // Read own profile
  const { data: ownProfile, error: ownProfErr } = await custClient.from('profiles').select('*').eq('id', uid).single();
  log('PROFILE_READ_OWN', ownProfile && !ownProfErr ? 'PASS' : 'FAIL', ownProfErr?.message || '');

  // Cannot read other profiles
  const { data: otherProfiles } = await custClient.from('profiles').select('id').neq('id', uid).limit(1);
  log('PROFILE_READ_OTHERS_BLOCKED', (!otherProfiles || otherProfiles.length === 0) ? 'PASS' : 'FAIL');

  // Cannot write role
  const { error: roleWriteErr } = await custClient.from('profiles').update({ role: 'admin' }).eq('id', uid);
  log('PROFILE_CANNOT_WRITE_ROLE', roleWriteErr ? 'PASS' : 'FAIL', roleWriteErr?.message || 'ALLOWED — SECURITY ISSUE');

  // Cannot write warehouse_id
  const { error: whWriteErr } = await custClient.from('profiles').update({ warehouse_id: '00000000-0000-0000-0000-000000000000' }).eq('id', uid);
  log('PROFILE_CANNOT_WRITE_WAREHOUSE_ID', whWriteErr ? 'PASS' : 'FAIL', whWriteErr?.message || 'ALLOWED');

  // ===== 2. CATALOG =====
  // Categories (no is_active filter — that column doesn't exist)
  const { data: categories, error: catErr } = await custClient.from('categories').select('*');
  log('CATALOG_CATEGORIES', !catErr && categories?.length > 0 ? 'PASS' : 'FAIL', catErr?.message || `count=${categories?.length}`);

  // Active products
  const { data: products, error: prodErr } = await custClient.from('products').select('*').eq('is_active', true).limit(5);
  log('CATALOG_ACTIVE_PRODUCTS', !prodErr && products?.length > 0 ? 'PASS' : 'FAIL', prodErr?.message || `count=${products?.length}`);

  // Inactive products blocked
  const { data: inactiveProds } = await custClient.from('products').select('id').eq('is_active', false).limit(1);
  log('CATALOG_INACTIVE_PRODUCTS_BLOCKED', (!inactiveProds || inactiveProds.length === 0) ? 'PASS' : 'FAIL', `inactive visible=${inactiveProds?.length || 0}`);

  // ===== 3. SERVICEABILITY =====
  // Udupi coordinates (should be in service zone)
  const { data: warehouseId, error: whErr } = await custClient.rpc('get_serving_warehouse', { p_lat: 13.3427, p_lng: 74.7472 });
  log('SERVICEABILITY_UDUPI', !whErr && warehouseId ? 'PASS' : 'FAIL', whErr?.message || `warehouse=${warehouseId}`);

  // Out-of-zone location (e.g., Delhi)
  const { data: delhiWh } = await custClient.rpc('get_serving_warehouse', { p_lat: 28.6139, p_lng: 77.2090 });
  log('SERVICEABILITY_DELHI_BLOCKED', delhiWh === null ? 'PASS' : 'FAIL', `returned=${delhiWh}`);

  // ===== 4. WAREHOUSE CATALOG =====
  let catalogProducts = [];
  if (warehouseId) {
    const { data: wCatalog, error: wcErr } = await custClient.rpc('get_warehouse_catalog', {
      p_warehouse_id: warehouseId, p_search_query: null
    });
    catalogProducts = wCatalog || [];
    log('WAREHOUSE_CATALOG', !wcErr && wCatalog?.length > 0 ? 'PASS' : 'FAIL', wcErr?.message || `count=${wCatalog?.length}`);
  } else {
    log('WAREHOUSE_CATALOG', 'SKIP', 'No serving warehouse for Udupi');
  }

  // ===== 5. WALLET SECURITY =====
  // Direct INSERT to wallet_transactions must fail
  const { error: walletInsertErr } = await custClient.from('wallet_transactions').insert({
    user_id: uid, amount: 500, type: 'credit', description: 'hack_test'
  });
  log('WALLET_DIRECT_INSERT_BLOCKED', walletInsertErr ? 'PASS' : 'FAIL — SECURITY ISSUE', walletInsertErr?.message || 'INSERT SUCCEEDED');

  // Direct UPDATE must fail
  const { error: walletUpdateErr } = await custClient.from('wallet_transactions').update({ amount: 9999 }).eq('user_id', uid);
  log('WALLET_DIRECT_UPDATE_BLOCKED', walletUpdateErr ? 'PASS' : 'FAIL — SECURITY ISSUE', walletUpdateErr?.message || 'UPDATE SUCCEEDED');

  // Read own wallet transactions
  const { data: ownWallet, error: ownWalletErr } = await custClient.from('wallet_transactions').select('*').eq('user_id', uid);
  log('WALLET_READ_OWN', !ownWalletErr ? 'PASS' : 'FAIL', ownWalletErr?.message || `count=${ownWallet?.length}`);

  // Cannot read others' wallet
  const { data: othersWallet } = await custClient.from('wallet_transactions').select('user_id').neq('user_id', uid).limit(1);
  log('WALLET_READ_OTHERS_BLOCKED', (!othersWallet || othersWallet.length === 0) ? 'PASS' : 'FAIL — SECURITY ISSUE');

  // ===== 6. CHECKOUT — COD =====
  let createdOrderId = null;
  if (warehouseId && catalogProducts.length > 0) {
    const firstProduct = catalogProducts[0];
    const checkoutPayload = {
      p_user_id: uid,
      p_address: 'Udupi Test Address, NH-169, Udupi',
      p_lat: 13.3427,
      p_lng: 74.7472,
      p_items: [{ productid: firstProduct.id || firstProduct.product_id, quantity: 1 }],
      p_discount_val: 0,
      p_coupon_code: null,
      p_delivery_fee: 4.99,
      p_delivery_speed: 'standard',
      p_payment_method: 'cod',
      p_idempotency_key: `test_${Date.now()}`
    };
    const { data: orderId, error: checkoutErr } = await custClient.rpc('process_checkout', checkoutPayload);
    if (!checkoutErr && orderId) {
      createdOrderId = orderId;
      log('CHECKOUT_COD', 'PASS', `orderId=${orderId}`);
    } else {
      log('CHECKOUT_COD', 'FAIL', checkoutErr?.message || 'no order returned');
    }
  } else {
    log('CHECKOUT_COD', 'SKIP', 'No warehouse/catalog available');
  }

  // ===== 7. ORDER RLS =====
  // Read own orders
  const { data: ownOrders, error: ordersErr } = await custClient.from('orders').select('id, customer_id, status').limit(10);
  const allOwnOrders = ownOrders?.every(o => o.customer_id === uid) ?? true;
  log('ORDERS_READ_OWN', !ordersErr ? 'PASS' : 'FAIL', ordersErr?.message || `count=${ownOrders?.length}`);
  log('ORDERS_NO_LEAK_OTHERS', allOwnOrders ? 'PASS' : 'FAIL — DATA LEAK');

  // ===== 8. ORDER ITEMS RLS =====
  if (createdOrderId) {
    const { data: ownItems, error: itemsErr } = await custClient.from('order_items').select('*').eq('order_id', createdOrderId);
    log('ORDER_ITEMS_OWN', !itemsErr && ownItems?.length > 0 ? 'PASS' : 'FAIL', itemsErr?.message || `count=${ownItems?.length}`);
  }

  // ===== 9. CUSTOMER_ADDRESSES RLS =====
  const { error: addrInsertErr } = await custClient.from('customer_addresses').insert({
    user_id: uid, label: 'Home Test', street_address: 'Test Street 1', city: 'Udupi', state: 'Karnataka', lat: 13.3427, lng: 74.7472
  });
  log('ADDRESS_INSERT', !addrInsertErr ? 'PASS' : 'FAIL', addrInsertErr?.message || '');

  const { data: ownAddrs, error: addrReadErr } = await custClient.from('customer_addresses').select('*');
  log('ADDRESS_READ_OWN', !addrReadErr ? 'PASS' : 'FAIL', addrReadErr?.message || `count=${ownAddrs?.length}`);

  // ===== 10. NOTIFICATIONS RLS =====
  const { data: notifs, error: notifErr } = await custClient.from('notifications').select('*').limit(5);
  log('NOTIFICATIONS_READ', !notifErr ? 'PASS' : 'FAIL', notifErr?.message || `count=${notifs?.length}`);

  // ===== 11. SUPPORT TICKETS =====
  const { error: ticketInsertErr } = await custClient.from('support_tickets').insert({
    customer_id: uid, subject: 'RLS Test Ticket', description: 'Test ticket', status: 'open'
  });
  log('SUPPORT_TICKET_CREATE', !ticketInsertErr ? 'PASS' : 'FAIL', ticketInsertErr?.message || '');

  // ===== CLEANUP =====
  await adminClient.auth.admin.deleteUser(uid);

  // ===== FINAL REPORT =====
  console.log('\n\n========== FINAL MOBILE REGRESSION REPORT ==========');
  for (const [test, result] of Object.entries(results)) {
    console.log(`  ${test}: ${result}`);
  }
  if (createdOrderId) {
    console.log(`\n  *** TEST COD ORDER ID: ${createdOrderId} ***`);
  }
}

run().catch(e => console.error('FATAL:', e.message));
