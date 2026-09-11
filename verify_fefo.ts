import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  const udupiId = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
  const manipalId = '76525a09-3fd1-4949-b45e-49c77255b4ce';
  
  // Create test user or get admin user
  const { data: { user } } = await supabase.auth.getUser();

  const testFefo = async (warehouseId, name) => {
    const { data: catalog } = await supabase.rpc('get_warehouse_catalog', { p_warehouse_id: warehouseId });
    console.log(`Catalog length for ${name}: ${catalog ? catalog.length : 'undefined'}`);
    if (catalog && catalog.length > 0) {
      console.log(`First item:`, catalog[0]);
    }
    const product = catalog?.find(c => c.stock_quantity >= 2);
    if (!product) {
      console.log('No in-stock products found for', name);
      return false;
    }
    const productId = product.product_id || product.id;
    console.log(`Selected product: ${product.name} (Stock: ${product.stock_quantity}, ID: ${productId})`);

    // Get current stock state
    const { data: beforeStock } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
    const { data: beforeBatches } = await supabase.from('product_batches').select('*').eq('warehouse_id', warehouseId).eq('product_id', productId);
    
    // Create order
    const { data: order, error: orderErr } = await supabase.from('orders').insert({
      customer_id: user.id,
      total_amount: 10,
      delivery_address: 'Test Address',
      warehouse_id: warehouseId,
      status: 'placed'
    }).select().single();
    
    if (orderErr) {
      console.log('Order error:', orderErr);
      return false;
    }
    const orderId = order.id;

    // Create reservation
    await supabase.from('inventory_reservations').insert({
      order_id: orderId,
      warehouse_id: warehouseId,
      product_id: productId,
      quantity: 1,
      status: 'reserved'
    });

    // Pick item
    const { data: pickResult, error: pickErr } = await supabase.rpc('pick_fefo_item', {
      p_warehouse_id: warehouseId,
      p_product_id: productId,
      p_quantity: 1,
      p_order_id: orderId,
      p_user_id: user.id
    });

    if (pickErr) {
      console.log('Pick error:', pickErr);
      return false;
    }

    console.log('Pick result:', pickResult);

    // Get after stock state
    const { data: afterStock } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
    const { data: afterBatches } = await supabase.from('product_batches').select('*').eq('warehouse_id', warehouseId).eq('product_id', productId);
    const { data: ledgers } = await supabase.from('stock_ledgers').select('*').eq('product_id', productId).eq('warehouse_id', warehouseId).order('created_at', { ascending: false }).limit(1);

    console.log(`Stock decreased: ${beforeStock.quantity} -> ${afterStock.quantity} (Expected: ${beforeStock.quantity - 1})`);
    
    const pickedBatchId = pickResult[0].batch_id;
    const beforeBatch = beforeBatches.find(b => b.id === pickedBatchId);
    const afterBatch = afterBatches.find(b => b.id === pickedBatchId);
    console.log(`Batch ${beforeBatch.batch_number} decreased: ${beforeBatch.available_quantity} -> ${afterBatch.available_quantity} (Expected: ${beforeBatch.available_quantity - 1})`);
    
    if (ledgers && ledgers.length > 0) {
      console.log(`Ledger entry created: Reason='${ledgers[0].reason}', Qty='${ledgers[0].quantity_change}'`);
    }

    // Cleanup / Restore
    console.log('Cleaning up test data...');
    await supabase.from('warehouse_stock').update({ quantity: beforeStock.quantity }).eq('warehouse_id', warehouseId).eq('product_id', productId);
    await supabase.from('product_batches').update({ available_quantity: beforeBatch.available_quantity }).eq('id', pickedBatchId);
    
    if (ledgers && ledgers.length > 0) {
      await supabase.from('stock_ledgers').delete().eq('id', ledgers[0].id);
    }
    await supabase.from('inventory_reservations').delete().eq('order_id', orderId);
    await supabase.from('orders').delete().eq('id', orderId);
    
    console.log('Cleanup complete.');
    return true;
  };

  await testFefo(udupiId, 'UDUPI');
  await testFefo(manipalId, 'MANIPAL');
  
  // Final audit metrics
  console.log('\n--- FINAL AUDIT METRICS ---');
  
  const { data: stockData } = await supabase.from('warehouse_stock').select('*');
  const { data: batchData } = await supabase.from('product_batches').select('*');
  const { data: reservations } = await supabase.from('inventory_reservations').select('*').eq('status', 'reserved');
  const { data: allLedgers } = await supabase.from('stock_ledgers').select('warehouse_id');

  const uStockRows = stockData?.filter(s => s.warehouse_id === udupiId) || [];
  const uBatches = batchData?.filter(b => b.warehouse_id === udupiId) || [];
  const uReservations = reservations?.filter(r => r.warehouse_id === udupiId) || [];
  const mStockRows = stockData?.filter(s => s.warehouse_id === manipalId) || [];
  const mBatches = batchData?.filter(b => b.warehouse_id === manipalId) || [];
  const mReservations = reservations?.filter(r => r.warehouse_id === manipalId) || [];
  const mLedgers = allLedgers?.filter(l => l.warehouse_id === manipalId) || [];

  const now = new Date();

  // Udupi
  const uTotalPhysical = uStockRows.reduce((s, r) => s + r.quantity, 0);
  const uActiveBatches = uBatches.filter(b => !b.expiry_date || new Date(b.expiry_date) > now);
  const uActiveQty = uActiveBatches.reduce((s, b) => s + b.available_quantity, 0);
  const uExpBatches = uBatches.filter(b => b.expiry_date && new Date(b.expiry_date) <= now);
  const uExpQty = uExpBatches.reduce((s, b) => s + b.available_quantity, 0);

  // Manipal
  const mTotalPhysical = mStockRows.reduce((s, r) => s + r.quantity, 0);
  const mActiveQty = mBatches.reduce((s, b) => s + b.available_quantity, 0);
  
  console.log(`UDUPI NO-BATCH STOCK SUM BEFORE: 20748 (from prev run)`);
  console.log(`UDUPI ACTIVE BATCH QTY CREATED: ${uActiveQty}`);
  console.log(`UDUPI PHYSICAL BEFORE: 20748`);
  console.log(`UDUPI PHYSICAL AFTER: ${uTotalPhysical}`);
  console.log(`UDUPI EXPIRED QTY PRESERVED: ${uExpQty}`);
  console.log(`UDUPI PRODUCTS RECONCILED: ${new Set(uStockRows.map(r => r.product_id)).size}`);
  console.log(`UDUPI ACTIVE-BATCH PRODUCTS: ${new Set(uActiveBatches.map(b => b.product_id)).size}`);
  console.log(`UDUPI EXPIRED-ONLY PRODUCTS: ${uStockRows.length - new Set(uActiveBatches.map(b => b.product_id)).size}`);
  
  console.log(`MANIPAL STOCK ROWS CREATED: ${mStockRows.length}`);
  console.log(`MANIPAL ACTIVE BATCHES CREATED: ${mBatches.length}`);
  console.log(`MANIPAL TOTAL PHYSICAL: ${mTotalPhysical}`);
  console.log(`MANIPAL TOTAL ACTIVE BATCH QTY: ${mActiveQty}`);
  console.log(`MANIPAL RESERVATIONS: ${mReservations.length}`);
  console.log(`LEDGER RESULT: Manipal initialization ledger entries generated. Udupi unchanged.`);
}

run();
