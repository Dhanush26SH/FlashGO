import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';


const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

// Ensure tests use real users. We'll use service role key for setting up the test state.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY; 
const adminClient = createClient(supabaseUrl, serviceKey || supabaseKey);
const customerClient = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('--- STARTING RUNTIME VERIFICATION ---');

  // Find users
  const { data: users } = await adminClient.from('profiles').select('*');
  const admin = users.find(u => u.role === 'admin');
  const customer = users.find(u => u.role === 'customer');
  const picker = users.find(u => u.role === 'picker');

  if (!admin || !customer) {
    console.log('Missing required users for test');
    return;
  }

  console.log(`Test Customer: ${customer.email}, Admin: ${admin.email}`);

  // Test 1: Outside coverage (lat/lng outside of any warehouse)
  console.log('\\n[TEST 1] OUTSIDE COVERAGE');
  let { data: whOut } = await adminClient.rpc('get_serving_warehouse', { p_lat: 80.0, p_lng: 80.0 });
  console.log('get_serving_warehouse(80.0, 80.0) ->', whOut);
  if (whOut === null) console.log('PASS: Returned NULL for unserviceable location.');
  else console.log('FAIL: Expected NULL.');

  // Check direct checkout rejection
  const { error: checkoutErr } = await adminClient.rpc('process_checkout', {
    p_user_id: customer.id,
    p_address: 'Moon Base',
    p_delivery_speed: 'express',
    p_payment_method: 'cod',
    p_items: [{ productId: 'some-id', quantity: 1 }],
    p_coupon_code: null,
    p_lat: 80.0,
    p_lng: 80.0,
    p_idempotency_key: 'test_outside'
  });
  console.log('Checkout Error (Outside Coverage):', checkoutErr?.message);
  if (checkoutErr?.message.includes('Unserviceable location')) console.log('PASS: Checkout blocked.');
  else console.log('FAIL: Checkout not blocked with correct error.');

  // Test 2: Invalid coordinates
  console.log('\\n[TEST 2] INVALID COORDINATES');
  let { data: whInv } = await adminClient.rpc('get_serving_warehouse', { p_lat: 100.0, p_lng: 200.0 });
  console.log('get_serving_warehouse(100.0, 200.0) ->', whInv);
  if (whInv === null) console.log('PASS: Rejected invalid coords.');

  // Fetch real warehouses
  const { data: warehouses } = await adminClient.from('warehouses').select('*').limit(2);
  if (warehouses.length < 2) {
    console.log('Need at least 2 warehouses for overlap/isolation tests.');
    return;
  }

  const whA = warehouses[0];
  const whB = warehouses[1];

  // Configure A and B with overlapping radiuses
  // A is at [13.3427, 74.7472]
  await adminClient.from('warehouses').update({ lat: 13.3427, lng: 74.7472, service_radius_km: 10, is_active: true }).eq('id', whA.id);
  // B is at [13.3500, 74.7500] (very close)
  await adminClient.from('warehouses').update({ lat: 13.3500, lng: 74.7500, service_radius_km: 10, is_active: true }).eq('id', whB.id);

  // Test 3: Inside Radius / Nearest deterministic
  console.log('\\n[TEST 3] OVERLAP / NEAREST');
  // 13.3428, 74.7473 is closer to A
  let { data: nearestToA } = await adminClient.rpc('get_serving_warehouse', { p_lat: 13.3428, p_lng: 74.7473 });
  console.log('Nearest to A ->', nearestToA, '(Expected:', whA.id, ')');
  if (nearestToA === whA.id) console.log('PASS: Selected nearest eligible deterministically.');
  else console.log('FAIL: Did not select nearest.');

  // Test 4: Inactive Warehouse
  console.log('\\n[TEST 4] INACTIVE WAREHOUSE');
  await adminClient.from('warehouses').update({ is_active: false }).eq('id', whA.id);
  let { data: inactiveNearest } = await adminClient.rpc('get_serving_warehouse', { p_lat: 13.3428, p_lng: 74.7473 });
  console.log('Nearest when A is inactive ->', inactiveNearest, '(Expected:', whB.id, ')');
  if (inactiveNearest === whB.id) console.log('PASS: Skipped inactive nearest warehouse.');
  else console.log('FAIL: Selected inactive or failed to fallback.');
  // Restore A
  await adminClient.from('warehouses').update({ is_active: true }).eq('id', whA.id);

  // Test 5: Stock Isolation
  console.log('\\n[TEST 5] STOCK ISOLATION');
  // Get a product
  const { data: prods } = await adminClient.from('products').select('*').limit(1);
  const p = prods[0];
  
  // Set stock in A to 0, stock in B to 10
  await adminClient.from('warehouse_stock').upsert({ warehouse_id: whA.id, product_id: p.id, quantity: 0, physical_count: 0 });
  await adminClient.from('warehouse_stock').upsert({ warehouse_id: whB.id, product_id: p.id, quantity: 10, physical_count: 10 });
  
  // Customer is near A. Checkout should fail, not route to B.
  const { error: stockErr } = await adminClient.rpc('process_checkout', {
    p_user_id: customer.id,
    p_address: 'Near A',
    p_delivery_speed: 'express',
    p_payment_method: 'cod',
    p_items: [{ productId: p.id, quantity: 1 }],
    p_coupon_code: null,
    p_lat: 13.3428,
    p_lng: 74.7473,
    p_idempotency_key: 'test_isolation'
  });
  console.log('Checkout Error (Stock Isolation):', stockErr?.message);
  if (stockErr?.message.includes('stock') || stockErr?.message.includes('stock')) {
    console.log('PASS: Checkout failed due to OOS in authoritative warehouse. Did not reroute to B.');
  } else {
    console.log('FAIL: Incorrect behavior.');
  }

  // Test 6: Security Matrix
  console.log('\\n[TEST 6] SECURITY MATRIX');
  
  // Authenticate as Admin
  const { data: adminLogin } = await adminClient.auth.signInWithPassword({ email: admin.email, password: 'password123' });
  const adminAuthClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${adminLogin.session?.access_token}` } } });
  
  // Admin Serviceability Update
  const { error: adminErr } = await adminAuthClient.rpc('admin_update_warehouse_serviceability', { p_warehouse_id: whA.id, p_radius_km: 6.5 });
  console.log('Admin Update Error:', adminErr?.message || 'None');
  if (!adminErr) console.log('PASS: Admin mutation allowed.');
  
  // Authenticate as Customer
  const { data: custLogin } = await customerClient.auth.signInWithPassword({ email: customer.email, password: 'password123' });
  const custAuthClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${custLogin.session?.access_token}` } } });
  
  // Customer Serviceability Update
  const { error: custErr } = await custAuthClient.rpc('admin_update_warehouse_serviceability', { p_warehouse_id: whA.id, p_radius_km: 10 });
  console.log('Customer Update Error:', custErr?.message || 'None');
  if (custErr) console.log('PASS: Customer mutation BLOCKED.');

  // Authenticate as Picker
  const { data: pickLogin } = await customerClient.auth.signInWithPassword({ email: picker.email, password: 'password123' });
  const pickAuthClient = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: `Bearer ${pickLogin.session?.access_token}` } } });
  const { error: pickErr } = await pickAuthClient.rpc('admin_update_warehouse_serviceability', { p_warehouse_id: whA.id, p_radius_km: 10 });
  console.log('Picker Update Error:', pickErr?.message || 'None');
  if (pickErr) console.log('PASS: Picker mutation BLOCKED.');

  console.log('\\n--- TESTS COMPLETE ---');
}

runTests();
