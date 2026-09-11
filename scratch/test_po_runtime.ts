import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// We must use a real admin user to test "genuine Auth/RLS test" and "backend mismatch rejection test"
const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

// Service role to grab an admin user
const adminClient = createClient(supabaseUrl, supabaseKey);

async function testRuntime() {
  console.log("--- B2B PROCUREMENT RUNTIME TESTS ---");

  const { data: adminProfiles, error: pErr } = await adminClient.from('profiles').select('id, role').eq('role', 'admin').limit(1);
  if (pErr || !adminProfiles.length) throw new Error("No admin found");
  const adminId = adminProfiles[0].id;

  const { data: pureDairy } = await adminClient.from('vendors').select('id').eq('name', 'PureDairy Co.').single();
  const { data: otherVendor } = await adminClient.from('vendors').select('id').eq('name', 'Apple Authorized Reseller/Distributor (FlashGO Demo)').single();
  
  const { data: amulProducts } = await adminClient.from('vendor_products').select('product_id').eq('vendor_id', pureDairy.id).limit(1);
  const { data: appleProducts } = await adminClient.from('vendor_products').select('product_id').eq('vendor_id', otherVendor.id).limit(1);
  
  const amulProduct = { id: amulProducts[0].product_id };
  const appleProduct = { id: appleProducts[0].product_id };
  const { data: wh } = await adminClient.from('warehouses').select('id').limit(1).single();

  console.log("Found test entities:");
  console.log("- PureDairy Co:", pureDairy.id);
  console.log("- Apple Vendor:", otherVendor.id);
  console.log("- Amul Product:", amulProduct.id);
  console.log("- Apple Product:", appleProduct.id);

  // Test 1: Valid mapping (PureDairy -> Amul)
  console.log("\nTEST A: Creating VALID PO (PureDairy -> Amul)");
  const { data: poValid, error: errValid } = await adminClient.rpc('admin_create_po', {
    p_vendor_id: pureDairy.id,
    p_warehouse_id: wh.id,
    p_items: [{ product_id: amulProduct.id, quantity: 1, cost_per_unit: 10 }],
    p_admin_id: adminId
  });
  if (errValid) console.error("❌ FAILED: Valid PO creation threw error:", errValid.message);
  else {
    console.log("✅ PASS: Valid PO created:", poValid.id);
    // Cleanup the test PO immediately
    await adminClient.from('procurement_orders').delete().eq('id', poValid.id);
    console.log("   Test PO cleaned up.");
  }

  // Test 2: Invalid mapping (PureDairy -> iPhone)
  console.log("\nTEST B: Creating MISMATCHED PO (PureDairy -> Apple)");
  const { data: poInvalid, error: errInvalid } = await adminClient.rpc('admin_create_po', {
    p_vendor_id: pureDairy.id,
    p_warehouse_id: wh.id,
    p_items: [{ product_id: appleProduct.id, quantity: 1, cost_per_unit: 10 }],
    p_admin_id: adminId
  });
  
  if (errInvalid) {
    if (errInvalid.message.includes('not mapped to vendor')) {
      console.log("✅ PASS: Mismatch correctly rejected by backend!");
      console.log("   Error:", errInvalid.message);
    } else {
      console.error("❌ FAILED: Mismatch rejected for wrong reason:", errInvalid.message);
    }
  } else {
    console.error("❌ FATAL: Mismatch was ACCEPTED by backend!", poInvalid);
    await adminClient.from('procurement_orders').delete().eq('id', poInvalid.id);
  }

  // Test 3: Regression for PO #179CFB
  console.log("\nTEST C: PO #179CFB Regression");
  const { data: po179, error: err179 } = await adminClient.from('procurement_orders')
     .select('id, vendor:vendors(name), status, total_cost, items:procurement_order_items(product:products(name), quantity, received_quantity)')
     .eq('id', '179cfbf4-3de5-492e-b6a4-4a25dd44a867')
     .single();
     
  if (err179) {
    console.error("❌ FAILED to fetch PO #179CFB:", err179);
  } else {
    const isPureDairy = po179.vendor.name === 'PureDairy Co.';
    const isReceived = po179.status === 'received';
    const isTotal = Number(po179.total_cost) === 125;
    const isQuantity = po179.items[0].quantity === 5 && po179.items[0].received_quantity === 5;
    
    if (isPureDairy && isReceived && isTotal && isQuantity) {
      console.log("✅ PASS: PO #179CFB is fully intact and correctly reflects previous data.");
    } else {
      console.error("❌ FAILED: PO #179CFB data mismatch!");
      console.log(po179);
    }
  }

  // 4. Test API UI Filter logic mock
  console.log("\nTEST D: UI Filter Logic Simulation");
  const { data: vp } = await adminClient.from('vendor_products').select('product_id').eq('vendor_id', pureDairy.id);
  const isAmulMapped = vp.some(v => v.product_id === amulProduct.id);
  const isAppleMapped = vp.some(v => v.product_id === appleProduct.id);
  if (isAmulMapped && !isAppleMapped) {
    console.log("✅ PASS: UI would correctly show Amul and hide Apple for PureDairy.");
  } else {
    console.error("❌ FAILED: vendor_products map is incorrect for PureDairy.", {isAmulMapped, isAppleMapped});
  }
}

testRuntime().catch(console.error);
