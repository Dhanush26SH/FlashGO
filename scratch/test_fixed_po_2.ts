import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const anonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  const result: any = {};
  
  const { data: wh } = await adminClient.from('warehouses').select('id').limit(1).single();
  const { data: vpList } = await adminClient.from('vendor_products').select('vendor_id, product_id').limit(1);
  const validVendorId = vpList[0].vendor_id;
  const validProductId = vpList[0].product_id;

  const { data: unmappedProds } = await adminClient.from('products').select('id');
  let invalidProductId = null;
  for (const p of unmappedProds) {
    const { data: check } = await adminClient.from('vendor_products').select('id').eq('vendor_id', validVendorId).eq('product_id', p.id);
    if (!check || check.length === 0) {
      invalidProductId = p.id;
      break;
    }
  }

  // Pre-test invariants
  const { count: cWh1 } = await adminClient.from('warehouse_stock').select('*', { count: 'exact', head: true });
  const { count: cBatches1 } = await adminClient.from('product_batches').select('*', { count: 'exact', head: true });
  const { count: cLedgers1 } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true });

  // Create genuine Admin User
  const anonClient = createClient(supabaseUrl, anonKey);
  const emailAdmin = `test_admin_${Date.now()}@flashgo.local`;
  const password = 'TestPassword123!';
  const { data: adminAuth } = await adminClient.auth.admin.createUser({ email: emailAdmin, password, email_confirm: true });
  await adminClient.from('profiles').update({ role: 'admin' }).eq('id', adminAuth.user.id);
  const { data: sessionAdmin } = await anonClient.auth.signInWithPassword({ email: emailAdmin, password });
  const userAdminClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${sessionAdmin.session.access_token}` } } });

  // TEST A: VALID MAPPING
  const { data: poValid, error: errValid } = await userAdminClient.rpc('admin_create_po', {
    p_vendor_id: validVendorId, p_warehouse_id: wh.id, p_items: [{ product_id: validProductId, quantity: 1, cost_per_unit: 10 }]
  });
  
  if (errValid) {
    result.test_a_valid = "FAILED: " + errValid.message;
  } else {
    const { data: validItems } = await adminClient.from('procurement_order_items').select('id').eq('procurement_order_id', poValid.id);
    result.test_a_valid = {
      status: "PASS",
      po_id: poValid.id,
      items_created: validItems.length
    };
    await adminClient.from('procurement_orders').delete().eq('id', poValid.id);
  }

  // TEST B: INVALID MAPPING
  const { data: poInvalid, error: errInvalid } = await userAdminClient.rpc('admin_create_po', {
    p_vendor_id: validVendorId, p_warehouse_id: wh.id, p_items: [{ product_id: invalidProductId, quantity: 1, cost_per_unit: 10 }]
  });

  if (errInvalid) {
    const { count: poCheck } = await adminClient.from('procurement_orders').select('*', { count: 'exact', head: true }).eq('vendor_id', validVendorId).eq('total_cost', 10).gte('created_at', new Date(Date.now() - 60000).toISOString());
    const { count: poItemsCheck } = await adminClient.from('procurement_order_items').select('*', { count: 'exact', head: true }).eq('product_id', invalidProductId).eq('cost_per_unit', 10).gte('created_at', new Date(Date.now() - 60000).toISOString());
    result.test_b_invalid = { status: "PASS", error_message: errInvalid.message, pos_created: poCheck, po_items_created: poItemsCheck };
  } else {
    result.test_b_invalid = "FAILED: Should have rejected.";
  }
  
  await adminClient.auth.admin.deleteUser(adminAuth.user.id);

  // Post-test invariants
  const { count: cWh2 } = await adminClient.from('warehouse_stock').select('*', { count: 'exact', head: true });
  const { count: cBatches2 } = await adminClient.from('product_batches').select('*', { count: 'exact', head: true });
  const { count: cLedgers2 } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true });
  
  result.invariants = {
    warehouse_stock: { pre: cWh1, post: cWh2 },
    product_batches: { pre: cBatches1, post: cBatches2 },
    stock_ledgers: { pre: cLedgers1, post: cLedgers2 }
  };

  // TEST C: Genuine Auth non-admin
  const emailNon = `test_picker_${Date.now()}@flashgo.local`;
  const { data: userAuth } = await adminClient.auth.admin.createUser({ email: emailNon, password, email_confirm: true });
  await adminClient.from('profiles').update({ role: 'picker' }).eq('id', userAuth.user.id);
  const { data: sessionNon } = await anonClient.auth.signInWithPassword({ email: emailNon, password });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${sessionNon.session.access_token}` } } });
  
  const { error: errNonAdmin } = await userClient.rpc('admin_create_po', {
    p_vendor_id: validVendorId, p_warehouse_id: wh.id, p_items: [{ product_id: validProductId, quantity: 1, cost_per_unit: 10 }]
  });
  result.test_c_auth = { status: errNonAdmin ? "PASS" : "FAILED", error_message: errNonAdmin?.message || "Successfully created PO as non-admin" };
  await adminClient.auth.admin.deleteUser(userAuth.user.id);

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\tests_output_2.json', JSON.stringify(result, null, 2));
}

runTests().catch(console.error);
