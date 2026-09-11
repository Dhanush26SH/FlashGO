import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseKey);

async function checkInvariants() {
  const result: any = {};
  
  // 1. Warehouse Stock
  const { data: whStock, error: whErr } = await adminClient.from('warehouse_stock').select('quantity');
  if (whErr) throw whErr;
  result.warehouse_stock = {
    row_count: whStock.length,
    sum_quantity: whStock.reduce((acc, r) => acc + Number(r.quantity), 0)
  };

  // 2. Product Batches
  const { data: batches, error: batchErr } = await adminClient.from('product_batches').select('received_quantity, available_quantity, goods_receipt_item_id');
  if (batchErr) throw batchErr;
  result.product_batches = {
    row_count: batches.length,
    sum_received_quantity: batches.reduce((acc, r) => acc + Number(r.received_quantity || 0), 0),
    sum_available_quantity: batches.reduce((acc, r) => acc + Number(r.available_quantity || 0), 0),
    count_available_gt_0: batches.filter(r => Number(r.available_quantity || 0) > 0).length,
    count_available_eq_0: batches.filter(r => Number(r.available_quantity || 0) === 0).length,
    count_linked_to_grn: batches.filter(r => r.goods_receipt_item_id !== null).length,
    count_not_linked_to_grn: batches.filter(r => r.goods_receipt_item_id === null).length
  };

  // 3. Stock Ledgers
  const { count: ledgers } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true });
  result.stock_ledgers = { row_count: ledgers };

  // 4. Inventory Reservations
  const { data: res, error: resErr } = await adminClient.from('inventory_reservations').select('quantity');
  if (!resErr && res) {
    result.inventory_reservations = {
      row_count: res.length,
      sum_quantity: res.reduce((acc, r) => acc + Number(r.quantity), 0)
    };
  } else {
    result.inventory_reservations = { row_count: 0, sum_quantity: 0, note: "Table doesn't exist" };
  }

  // 5. Amul Gold
  const { data: amulBatches } = await adminClient.from('product_batches')
    .select('batch_number, received_quantity, available_quantity, expiry_date, goods_receipt_item_id, warehouse_id')
    .eq('product_id', '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');
  
  result.amul_gold_batches = amulBatches;

  // 6. Mapping Coverage
  const { data: allVp } = await adminClient.from('vendor_products').select('vendor_id, product_id, is_active, products(is_active)');
  const total = allVp.length;
  const active = allVp.filter((vp: any) => vp.is_active).length;
  const uniqueProducts = new Set(allVp.filter((vp: any) => vp.is_active).map((vp: any) => vp.product_id));
  
  const { data: allActiveProds } = await adminClient.from('products').select('id').eq('is_active', true);
  const allActiveProdsIds = allActiveProds.map((p: any) => p.id);
  
  const unmapped = allActiveProdsIds.filter(id => !uniqueProducts.has(id));
  const mappedActiveCount = allActiveProdsIds.filter(id => uniqueProducts.has(id)).length;
  
  const duplicatePairs = allVp.length - new Set(allVp.map((vp: any) => `${vp.vendor_id}_${vp.product_id}`)).size;
  const inactiveRef = allVp.filter((vp: any) => !vp.products?.is_active).length;
  const nonexistentRef = allVp.filter((vp: any) => !vp.products).length;
  const uniqueVendors = new Set(allVp.filter((vp: any) => vp.is_active).map((vp: any) => vp.vendor_id)).size;

  result.mapping_coverage = {
    total_vendor_products: total,
    active_vendor_products: active,
    distinct_active_product_id: uniqueProducts.size,
    active_products_mapped: mappedActiveCount,
    active_products_unmapped: unmapped.length,
    duplicate_pairs: duplicatePairs,
    mappings_to_inactive: inactiveRef,
    mappings_to_nonexistent: nonexistentRef,
    distinct_vendors: uniqueVendors
  };

  // 7. PO #179CFB
  const { data: po179 } = await adminClient.from('procurement_orders')
    .select(`
      id,
      vendor:vendors(name),
      total_cost,
      status,
      items:procurement_order_items(quantity, received_quantity),
      receipts:goods_receipts(id)
    `)
    .eq('id', '53ea865d-2b8f-44d0-a2b6-e249b4179cfb')
    .single();

  if (po179) {
    const receipts = po179.receipts || [];
    const grnIds = receipts.map((r: any) => r.id);
    let itemIds: string[] = [];
    if (grnIds.length > 0) {
      const { data: poGrnItems } = await adminClient.from('goods_receipt_items').select('id').in('receipt_id', grnIds);
      itemIds = poGrnItems?.map((i: any) => i.id) || [];
    }
    
    let batchesForPo = 0;
    if (itemIds.length > 0) {
      const { count } = await adminClient.from('product_batches').select('*', { count: 'exact', head: true }).in('goods_receipt_item_id', itemIds);
      batchesForPo = count || 0;
    }
    
    // Ledgers for these receipts
    let ledgersCount = 0;
    if (grnIds.length > 0) {
       const { count } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true }).eq('transaction_type', 'inward').in('reference_id', grnIds);
       ledgersCount = count || 0;
    }

    result.po_179cfb = {
      id: po179.id,
      vendor: po179.vendor?.name,
      total_cost: po179.total_cost,
      ordered_quantity: po179.items[0]?.quantity,
      received_quantity: po179.items[0]?.received_quantity,
      status: po179.status,
      receipts_count: receipts.length,
      batches_associated: batchesForPo,
      stock_ledgers_receipts: ledgersCount
    };
  } else {
    result.po_179cfb = "Not found";
  }

  // Write strict invariants
  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\strict_invariants.json', JSON.stringify(result, null, 2));
}

checkInvariants().catch(console.error);
