import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const anonKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function verifyRepair() {
  const result: any = {};
  
  // 1. Verify exactly ONE PureDairy vendor remains
  const { data: vendors } = await adminClient.from('vendors').select('*').ilike('name', '%PureDairy%');
  result.pure_dairy_vendors_count = vendors?.length;
  result.pure_dairy_vendors = vendors;

  // 2. Original PureDairy ID unchanged & PO #179CFB still references original PureDairy
  const { data: po179 } = await adminClient.from('procurement_orders').select('vendor_id, status, total_cost, items:procurement_order_items(quantity, received_quantity)').eq('id', '53ea865d-2b8f-44d0-a2b6-e249b4179cfb').single();
  result.po_179cfb = {
    vendor_id: po179?.vendor_id,
    status: po179?.status,
    total_cost: po179?.total_cost,
    ordered_qty: po179?.items[0]?.quantity,
    received_qty: po179?.items[0]?.received_quantity
  };

  // 3. Original PureDairy vendor_products count > 0 & Amul products mapped
  const { count: vpCount } = await adminClient.from('vendor_products').select('*', { count: 'exact', head: true }).eq('vendor_id', 'b0000000-0000-0000-0000-000000000002');
  result.original_puredairy_vp_count = vpCount;

  // 4. Mapping stats
  const { data: allVp } = await adminClient.from('vendor_products').select('vendor_id, product_id, is_active, products(is_active)');
  const uniqueProducts = new Set(allVp.filter((vp: any) => vp.is_active).map((vp: any) => vp.product_id));
  const { data: allActiveProds } = await adminClient.from('products').select('id').eq('is_active', true);
  const allActiveProdsIds = allActiveProds.map((p: any) => p.id);
  const unmapped = allActiveProdsIds.filter(id => !uniqueProducts.has(id));
  const mappedActiveCount = allActiveProdsIds.filter(id => uniqueProducts.has(id)).length;
  const duplicatePairs = allVp.length - new Set(allVp.map((vp: any) => `${vp.vendor_id}_${vp.product_id}`)).size;

  result.mapping_stats = {
    active_products_mapped: mappedActiveCount,
    active_products_unmapped: unmapped.length,
    duplicate_pairs: duplicatePairs
  };

  // 5. Invariants
  const { count: cWh } = await adminClient.from('warehouse_stock').select('*', { count: 'exact', head: true });
  const { count: cBatches } = await adminClient.from('product_batches').select('*', { count: 'exact', head: true });
  const { count: cLedgers } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true });
  
  result.invariants_post = {
    warehouse_stock: cWh,
    product_batches: cBatches,
    stock_ledgers: cLedgers
  };

  // 6. Genuine Admin Auth check
  const anonClient = createClient(supabaseUrl, anonKey);
  const emailAdmin = `test_admin_${Date.now()}@flashgo.local`;
  const password = 'TestPassword123!';
  const { data: adminAuth } = await adminClient.auth.admin.createUser({ email: emailAdmin, password, email_confirm: true });
  await adminClient.from('profiles').update({ role: 'admin' }).eq('id', adminAuth.user.id);
  const { data: sessionAdmin } = await anonClient.auth.signInWithPassword({ email: emailAdmin, password });
  const userAdminClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${sessionAdmin.session.access_token}` } } });

  const { data: vendorProducts } = await userAdminClient.from('vendor_products').select('product_id, products(name)').eq('vendor_id', 'b0000000-0000-0000-0000-000000000002');
  result.genuine_admin_fetch = vendorProducts?.map(vp => (vp.products as any)?.name);

  await adminClient.auth.admin.deleteUser(adminAuth.user.id);

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\verify_repair.json', JSON.stringify(result, null, 2));
}

verifyRepair().catch(console.error);
