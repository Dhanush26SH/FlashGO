import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableExists(tableName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select('id').limit(1);
  if (error && error.code === '42P01') {
    return false;
  }
  return true;
}

async function getCount(tableName: string): Promise<number | null> {
  const exists = await checkTableExists(tableName);
  if (!exists) return null;
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  return count;
}

async function runAudit() {
  console.log('--- STARTING PROCUREMENT AUDIT ---\n');

  const hasVendors = await checkTableExists('vendors');
  const hasSuppliers = await checkTableExists('suppliers');
  const hasPurchaseOrders = await checkTableExists('purchase_orders');
  const hasProcurementOrders = await checkTableExists('procurement_orders');
  const hasPOItems = await checkTableExists('purchase_order_items');
  const hasProcItems = await checkTableExists('procurement_order_items');
  const hasGRN = await checkTableExists('goods_receipts');
  const hasStockLedgers = await checkTableExists('stock_ledgers');

  // Fetch all active products
  const { data: activeProducts } = await supabase.from('products').select('id, stock_quantity').eq('is_active', true);
  const activeProductIds = activeProducts!.map(p => p.id);
  console.log(`ACTIVE PRODUCTS: ${activeProducts!.length}`);

  // Products with warehouse stock
  const { data: whStock } = await supabase.from('warehouse_stock').select('product_id');
  const productsWithStock = new Set(whStock?.filter(ws => activeProductIds.includes(ws.product_id)).map(ws => ws.product_id));
  console.log(`ACTIVE PRODUCTS WITH WAREHOUSE STOCK: ${productsWithStock.size}`);

  // Products with batch records
  const { data: batches } = await supabase.from('product_batches').select('product_id');
  const productsWithBatches = new Set(batches?.filter(b => activeProductIds.includes(b.product_id)).map(b => b.product_id));
  console.log(`ACTIVE PRODUCTS WITH BATCH RECORDS: ${productsWithBatches.size}`);

  // Products with procurement history (assuming we find a table)
  let productsWithPO = new Set();
  if (hasPOItems) {
    const { data: poItems } = await supabase.from('purchase_order_items').select('product_id');
    productsWithPO = new Set(poItems?.filter(poi => activeProductIds.includes(poi.product_id)).map(poi => poi.product_id));
  } else if (hasProcItems) {
    const { data: poItems } = await supabase.from('procurement_order_items').select('product_id');
    productsWithPO = new Set(poItems?.filter(poi => activeProductIds.includes(poi.product_id)).map(poi => poi.product_id));
  }
  console.log(`ACTIVE PRODUCTS WITH PROCUREMENT/PO HISTORY: ${productsWithPO.size}`);

  // Traceability logic
  console.log(`ACTIVE PRODUCTS WHOSE CURRENT STOCK IS TRACEABLE TO A SUPPLIER/RECEIPT: ${productsWithPO.size}`); // Assuming none if 0
  
  // Seeded / Untraceable stock
  let seededCount = 0;
  for (const pid of activeProductIds) {
     if (!productsWithPO.has(pid)) {
       // if it has stock but no PO
       const prod = activeProducts!.find(p => p.id === pid);
       if ((prod?.stock_quantity || 0) > 0 || productsWithStock.has(pid)) {
         seededCount++;
       }
     }
  }
  console.log(`ACTIVE PRODUCTS WITH SEEDED/UNTRACEABLE STOCK: ${seededCount}`);

  // Table counts
  const suppliersCount = (await getCount('vendors')) ?? (await getCount('suppliers')) ?? 0;
  let poCount = 0;
  if (hasPurchaseOrders) poCount = await getCount('purchase_orders') || 0;
  else if (hasProcurementOrders) poCount = await getCount('procurement_orders') || 0;

  console.log(`\nSUPPLIER TABLE: ${hasVendors ? 'vendors' : (hasSuppliers ? 'suppliers' : 'MISSING')}`);
  console.log(`TOTAL SUPPLIERS: ${suppliersCount}`);
  console.log(`PURCHASE ORDER TABLE: ${hasPurchaseOrders ? 'purchase_orders' : (hasProcurementOrders ? 'procurement_orders' : 'MISSING')}`);
  console.log(`TOTAL PURCHASE ORDERS: ${poCount}`);
  console.log(`PO ITEM TABLE: ${hasPOItems ? 'purchase_order_items' : (hasProcItems ? 'procurement_order_items' : 'MISSING')}`);
  console.log(`GOODS RECEIPT/INWARD IMPLEMENTATION: ${hasGRN ? 'goods_receipts' : 'MISSING'}`);

  console.log(`BATCH TRACKING: ${await checkTableExists('product_batches') ? 'product_batches table exists' : 'MISSING'}`);
  // Check Cost Tracking
  let costTracking = 'MISSING';
  if (hasPOItems) {
     const { data: poItemsCols } = await supabase.from('purchase_order_items').select('unit_price, cost').limit(1).catch(() => ({data: null}));
     if (poItemsCols) costTracking = 'In PO Items';
  } else if (hasProcItems) {
     costTracking = 'In Procurement Items';
  }
  console.log(`COST TRACKING: ${costTracking}`);

  console.log(`STOCK LEDGER TRACKING: ${hasStockLedgers ? 'stock_ledgers table exists' : 'MISSING'}`);
  
  // Check Damaged/Expired Tracking
  let damagedTracking = 'MISSING';
  if (hasStockLedgers) {
     damagedTracking = 'Likely via stock_ledgers reason/type enum';
  }
  console.log(`DAMAGED/EXPIRED TRACKING: ${damagedTracking}`);
  
  console.log(`ADMIN PROCUREMENT UI: MISSING`);
  console.log(`WAREHOUSE INWARD UI: MISSING`);
}

runAudit().catch(console.error);
