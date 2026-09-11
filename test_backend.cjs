const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars.");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log("Starting Warehouse Staff Invariant Tests...");

  // 1. Get a valid warehouse staff user
  const { data: staffProfiles, error: staffErr } = await adminClient
    .from('profiles')
    .select('*')
    .eq('role', 'warehouse_staff')
    .not('warehouse_id', 'is', null)
    .limit(1);

  if (staffErr || !staffProfiles || staffProfiles.length === 0) {
    console.error("No valid warehouse staff found. Creating one...");
    // Just try to fetch any staff or change someone's role for the test
  }
  const staff = staffProfiles[0];
  console.log(`Using Staff: ${staff.email} (${staff.id}) at Warehouse: ${staff.warehouse_id}`);

  // 2. Get a valid picker
  const { data: pickers } = await adminClient.from('profiles').select('*').eq('role', 'picker').limit(1);
  const picker = pickers[0];

  // 3. Get a product
  const { data: products } = await adminClient.from('products').select('*').limit(1);
  const product = products[0];

  // TEST 1: Inward stock as picker (Should FAIL)
  console.log("\n[TEST] Picker attempting to inward stock...");
  const { error: pickerInwardErr } = await adminClient.rpc('inward_stock_batch', {
    p_warehouse_id: staff.warehouse_id,
    p_product_id: product.id,
    p_quantity: 10,
    p_expiry_date: '2026-12-31',
    p_batch_number: 'TEST-PICKER',
    p_admin_id: picker.id // Service role can bypass RLS, but the RPC explicitly checks profile.role
  });
  if (pickerInwardErr) {
    console.log("PASS: Picker rejected from inwarding stock. Error:", pickerInwardErr.message);
  } else {
    console.error("FAIL: Picker was able to inward stock!");
  }

  // TEST 2: Inward stock as warehouse staff (Should PASS)
  console.log("\n[TEST] Warehouse Staff inwarding stock...");
  const { data: batchId, error: staffInwardErr } = await adminClient.rpc('inward_stock_batch', {
    p_warehouse_id: staff.warehouse_id,
    p_product_id: product.id,
    p_quantity: 50,
    p_expiry_date: '2026-12-31',
    p_batch_number: 'TEST-STAFF-1',
    p_admin_id: staff.id
  });
  if (staffInwardErr) {
    console.error("FAIL: Staff inwarding failed:", staffInwardErr);
  } else {
    console.log(`PASS: Staff inwarded stock. Batch ID: ${batchId}`);
  }

  // TEST 3: Adjust stock downward (Should PASS)
  console.log("\n[TEST] Warehouse Staff adjusting stock downward...");
  const { error: adjustErr } = await adminClient.rpc('adjust_batch_stock', {
    p_batch_id: batchId,
    p_quantity_change: -5,
    p_reason: 'damaged',
    p_user_id: staff.id
  });
  if (adjustErr) {
    console.error("FAIL: Staff adjustment failed:", adjustErr);
  } else {
    console.log("PASS: Staff adjusted stock successfully.");
  }

  // TEST 4: Adjust stock below reservations (Should FAIL)
  console.log("\n[TEST] Creating mock reservation to test protection...");
  const { data: orders } = await adminClient.from('orders').select('*').limit(1);
  if (orders && orders.length > 0) {
    const order = orders[0];
    await adminClient.from('inventory_reservations').insert({
      order_id: order.id,
      warehouse_id: staff.warehouse_id,
      product_id: product.id,
      quantity: 1000 // A huge reservation
    });

    console.log("[TEST] Warehouse Staff attempting to adjust stock below reservations...");
    const { error: overAdjustErr } = await adminClient.rpc('adjust_batch_stock', {
      p_batch_id: batchId,
      p_quantity_change: -50,
      p_reason: 'lost',
      p_user_id: staff.id
    });
    
    if (overAdjustErr) {
      console.log("PASS: Backend prevented adjustment below reservations. Error:", overAdjustErr.message);
    } else {
      console.error("FAIL: Backend allowed adjustment below reservations!");
    }

    // Cleanup reservation
    await adminClient.from('inventory_reservations').delete().eq('order_id', order.id).eq('product_id', product.id).eq('quantity', 1000);
  } else {
    console.log("SKIPPED: No order found to create a mock reservation.");
  }

  // TEST 5: Verify Ledger Entries
  console.log("\n[TEST] Verifying stock ledgers...");
  const { data: ledgers } = await adminClient.from('stock_ledgers').select('*').eq('batch_id', batchId);
  console.log(`Ledger entries found: ${ledgers?.length || 0}`);
  ledgers?.forEach(l => console.log(`  Reason: ${l.reason}, Qty: ${l.quantity_change}, Performed by: ${l.performed_by}`));
  if (ledgers && ledgers.length >= 2) {
    console.log("PASS: Ledgers created correctly.");
  } else {
    console.log("FAIL: Missing ledger entries.");
  }

  console.log("\nAll backend tests completed.");
}

runTests();
