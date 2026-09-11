import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseKey);

async function testEnforcement() {
  const result: any = {};
  
  const { data: adminProfiles } = await adminClient.from('profiles').select('id').eq('role', 'admin').limit(1);
  const adminId = adminProfiles[0].id;
  const { data: wh } = await adminClient.from('warehouses').select('id').limit(1).single();

  // Pick a vendor that has at least one mapped product
  const { data: vpList } = await adminClient.from('vendor_products').select('vendor_id, product_id').limit(1);
  const validVendorId = vpList[0].vendor_id;
  const validProductId = vpList[0].product_id;

  // Pick a product that is NOT mapped to this vendor
  const { data: unmappedProds } = await adminClient.from('products').select('id');
  let invalidProductId = null;
  for (const p of unmappedProds) {
    const { data: check } = await adminClient.from('vendor_products').select('id').eq('vendor_id', validVendorId).eq('product_id', p.id);
    if (!check || check.length === 0) {
      invalidProductId = p.id;
      break;
    }
  }

  // 1. Valid mapped vendor + product
  const { data: poValid, error: errValid } = await adminClient.rpc('admin_create_po', {
    p_vendor_id: validVendorId,
    p_warehouse_id: wh.id,
    p_items: [{ product_id: validProductId, quantity: 1, cost_per_unit: 10 }],
    p_admin_id: adminId
  });

  result.valid_po = errValid ? errValid.message : poValid.id;
  
  if (!errValid) {
    // delete it to keep clean state
    await adminClient.from('procurement_orders').delete().eq('id', poValid.id);
  }

  // 2. Unmapped vendor + product
  const { data: poInvalid, error: errInvalid } = await adminClient.rpc('admin_create_po', {
    p_vendor_id: validVendorId,
    p_warehouse_id: wh.id,
    p_items: [{ product_id: invalidProductId, quantity: 1, cost_per_unit: 10 }],
    p_admin_id: adminId
  });

  result.invalid_po = errInvalid ? errInvalid.message : "Succeeded unexpectedly!";

  // 3. Verify zero rows created for the failed attempt
  const { count: poCount } = await adminClient.from('procurement_orders').select('*', { count: 'exact', head: true }).eq('vendor_id', validVendorId).eq('total_cost', 10).gte('created_at', new Date(Date.now() - 60000).toISOString());
  result.rejected_po_rows_created = poCount;

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\enforcement_result.json', JSON.stringify(result, null, 2));
}

testEnforcement().catch(console.error);
