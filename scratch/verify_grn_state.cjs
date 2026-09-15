const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
  const env = fs.readFileSync('c:\\\\Users\\\\dhanu\\\\FlashGO\\\\.env', 'utf8');
  const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
  const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];
  
  const sb = createClient(url, key);
  await sb.auth.signInWithPassword({ email: 'admin@flashgo.com', password: 'password123' });

  const poId = 'd76bd1d2-3ab0-478a-8a9c-96d1971050d3';
  
  console.log("=== 1. SUPPLIER DISPATCH BATCHES ===");
  const { data: batches } = await sb.from('supplier_dispatch_batches').select('*').eq('procurement_order_id', poId);
  console.log(JSON.stringify(batches, null, 2));
  
  console.log("=== 2. PROCUREMENT ORDER ===");
  const { data: po } = await sb.from('procurement_orders').select('id, status, items:procurement_order_items(*)').eq('id', poId).single();
  console.log(JSON.stringify(po, null, 2));

  console.log("=== 3. GRN ===");
  const { data: grn } = await sb.from('goods_receipts').select('*, items:goods_receipt_items(*)').eq('procurement_order_id', poId).order('created_at', { ascending: false }).limit(1).single();
  console.log(JSON.stringify(grn, null, 2));

  const warehouseId = grn.warehouse_id;
  const productId = grn.items[0].product_id;

  console.log("=== 4. WAREHOUSE STOCK ===");
  const { data: stock } = await sb.from('warehouse_stock').select('*').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
  console.log(JSON.stringify(stock, null, 2));

  console.log("=== 5. PRODUCT BATCHES ===");
  const { data: productBatch } = await sb.from('product_batches').select('*').eq('goods_receipt_item_id', grn.items[0].id);
  console.log(JSON.stringify(productBatch, null, 2));

  console.log("=== 6. PUTAWAY TASKS ===");
  const { data: putaway } = await sb.from('putaway_tasks').select('*').eq('batch_id', productBatch[0]?.id);
  console.log(JSON.stringify(putaway, null, 2));

  console.log("=== 8. PLACEMENTS ===");
  const { data: placements } = await sb.from('warehouse_product_placements').select('quantity').eq('warehouse_id', warehouseId).eq('product_id', productId);
  const totalPlaced = placements.reduce((acc, p) => acc + p.quantity, 0);
  console.log("Total Placed (SUM):", totalPlaced);

  console.log("=== 10. SHIFTS ===");
  const { data: shift } = await sb.from('staff_shifts').select('*').eq('staff_id', grn.received_by).order('created_at', { ascending: false }).limit(1).single();
  console.log(JSON.stringify(shift, null, 2));
}

run().catch(console.error);
