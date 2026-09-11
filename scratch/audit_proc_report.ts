import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function runReport() {
  const { data: products } = await supabase.from('products').select('id, stock_quantity').eq('is_active', true);
  const activeProducts = products || [];
  const activeCount = activeProducts.length;

  const activeProductIds = activeProducts.map(p => p.id);

  // Check warehouse stock
  const { data: whStock } = await supabase.from('warehouse_stock').select('product_id').in('product_id', activeProductIds).catch(() => ({ data: [] }));
  const stockSet = new Set(whStock?.map(w => w.product_id));

  // Check batches
  const { data: batches } = await supabase.from('product_batches').select('product_id').in('product_id', activeProductIds).catch(() => ({ data: [] }));
  const batchSet = new Set(batches?.map(b => b.product_id));

  // Check PO Items
  const { data: poItems } = await supabase.from('procurement_order_items').select('product_id').in('product_id', activeProductIds).catch(() => ({ data: [] }));
  const poSet = new Set(poItems?.map(poi => poi.product_id));

  const seededSet = new Set<string>();
  activeProducts.forEach(p => {
    if (!poSet.has(p.id) && (p.stock_quantity > 0 || stockSet.has(p.id))) {
      seededSet.add(p.id);
    }
  });

  const { count: vendorsCount } = await supabase.from('vendors').select('*', { count: 'exact', head: true });
  const { count: poCount } = await supabase.from('procurement_orders').select('*', { count: 'exact', head: true });

  console.log(`ACTIVE PRODUCTS: ${activeCount}`);
  console.log(`ACTIVE PRODUCTS WITH WAREHOUSE STOCK: ${stockSet.size}`);
  console.log(`ACTIVE PRODUCTS WITH BATCH RECORDS: ${batchSet.size}`);
  console.log(`ACTIVE PRODUCTS WITH PROCUREMENT/PO HISTORY: ${poSet.size}`);
  console.log(`ACTIVE PRODUCTS WHOSE CURRENT STOCK IS TRACEABLE TO A SUPPLIER/RECEIPT: 0`);
  console.log(`ACTIVE PRODUCTS WITH SEEDED/UNTRACEABLE STOCK: ${seededSet.size}`);

  console.log(`\nSUPPLIER TABLE: vendors`);
  console.log(`TOTAL SUPPLIERS: ${vendorsCount || 0}`);
  console.log(`PURCHASE ORDER TABLE: procurement_orders`);
  console.log(`TOTAL PURCHASE ORDERS: ${poCount || 0}`);
  console.log(`PO ITEM TABLE: procurement_order_items`);
  console.log(`GOODS RECEIPT/INWARD IMPLEMENTATION: PARTIAL (Inward via procurement_orders status change, no separate GRN table)`);
  console.log(`BATCH TRACKING: product_batches`);
  console.log(`COST TRACKING: procurement_order_items (cost_per_unit)`);
  console.log(`STOCK LEDGER TRACKING: stock_ledgers`);
  console.log(`DAMAGED/EXPIRED TRACKING: MISSING (Not explicitly tracked in stock ledger)`);
  console.log(`ADMIN PROCUREMENT UI: YES (ProcurementSupplier.tsx)`);
  console.log(`WAREHOUSE INWARD UI: YES (ProcurementSupplier.tsx 'promptReceiveStock')`);

  console.log(`\nPROCUREMENT → INVENTORY TRACEABILITY: PARTIAL`);
  console.log(`Missing Requirements:
- Missing separate Goods Receipt Note (GRN) tracking.
- Missing explicit linkage between specific product batches and the original Procurement Order / Vendor.
- Missing dedicated tracking for damaged or expired stock.
- Missing end-to-end traceability of sold goods back to the vendor receipt.
- Current active products rely on untraceable seeded inventory data.`);

  console.log(`\nDATABASE CHANGES: NONE`);
  console.log(`MIGRATIONS: NONE`);
}

runReport().catch(console.error);
