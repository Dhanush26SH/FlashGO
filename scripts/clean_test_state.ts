import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--destructive');
const DELETED_APPLE_ORDER_ID = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228';
const APPLE_PRODUCT_ID = 'ce22a7e6-c7a6-46bd-867c-1f9f6fd8794e';
const ABNORMAL_PLACED_ORDERS = ['e216dfb0-2046-4cf5-a6da-b5ae2fd4969d', 'c02f5cdd-693e-48b6-b629-9457d1e97fc8'];

async function getStockValues(warehouseId, batchId, locationId, productId) {
  const { data: wStock } = await supabase.from('warehouse_stock').select('quantity, id').eq('warehouse_id', warehouseId).eq('product_id', productId).single();
  const { data: bStock } = await supabase.from('product_batches').select('available_quantity').eq('id', batchId).single();
  let pStock = null;
  if (locationId) {
    const { data: pRes } = await supabase.from('warehouse_product_placements').select('quantity, id').eq('location_id', locationId).eq('product_id', productId).single();
    pStock = pRes;
  }
  return { wStock, bStock, pStock };
}

async function run() {
  console.log(`Starting cleanup in ${DRY_RUN ? 'DRY-RUN' : 'DESTRUCTIVE'} mode...\n`);

  const { error: authErr, data: authData } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });
  if (authErr) throw authErr;
  
  const adminId = authData.user.id;

  console.log('--- 1. Apple Order Reconciliation Check ---');
  const { data: ledgers } = await supabase.from('stock_ledgers').select('*').eq('order_id', DELETED_APPLE_ORDER_ID);
  
  let netLedgerMissing = 0, appleBatchId = null, appleWarehouseId = null, hasRestoreEvent = false;

  for (const l of ledgers || []) {
    if (l.reason === 'RESTORE_TEST_APPLE') hasRestoreEvent = true;
    else netLedgerMissing += l.quantity_change;
    if (l.batch_id) appleBatchId = l.batch_id;
    if (l.warehouse_id) appleWarehouseId = l.warehouse_id;
  }

  const { data: placementEvents } = await supabase.from('warehouse_placement_events')
    .select('*')
    .eq('product_id', APPLE_PRODUCT_ID)
    .eq('actor_id', ledgers?.[0]?.performed_by)
    .order('created_at', { ascending: false });

  const pickEvent = placementEvents?.find(e => e.event_type === 'pick' && e.quantity === Math.abs(netLedgerMissing));
  const locationId = pickEvent?.from_location_id;

  if (netLedgerMissing === -2 && !hasRestoreEvent && pickEvent) {
    const before = await getStockValues(appleWarehouseId, appleBatchId, locationId, APPLE_PRODUCT_ID);
    console.log(`DELETED APPLE ORDER BEFORE: warehouse_stock: ${before.wStock?.quantity}, product_batch: ${before.bStock?.available_quantity}, placement: ${before.pStock?.quantity}`);
    
    if (!DRY_RUN) {
      await supabase.from('warehouse_stock').update({ quantity: before.wStock.quantity + 2 }).eq('id', before.wStock.id);
      await supabase.from('product_batches').update({ available_quantity: before.bStock.available_quantity + 2 }).eq('id', appleBatchId);
      await supabase.from('warehouse_product_placements').update({ quantity: before.pStock.quantity + 2 }).eq('id', before.pStock.id);
      
      await supabase.from('stock_ledgers').insert({
        warehouse_id: appleWarehouseId, product_id: APPLE_PRODUCT_ID, quantity_change: 2,
        reason: 'RESTORE_TEST_APPLE', performed_by: adminId, batch_id: appleBatchId, order_id: DELETED_APPLE_ORDER_ID
      });
      await supabase.from('warehouse_placement_events').insert({
        warehouse_id: appleWarehouseId, product_id: APPLE_PRODUCT_ID, from_location_id: locationId, quantity: 2,
        event_type: 'restock', source: 'system_reconciliation', actor_id: adminId
      });
      
      const after = await getStockValues(appleWarehouseId, appleBatchId, locationId, APPLE_PRODUCT_ID);
      console.log(`DELETED APPLE ORDER AFTER: warehouse_stock: ${after.wStock?.quantity}, product_batch: ${after.bStock?.available_quantity}, placement: ${after.pStock?.quantity}`);
    }
  }

  console.log('\n--- 2. Abnormal Placed Orders Reconciliation Check ---');
  for (const id of ABNORMAL_PLACED_ORDERS) {
    const { data: aLedgers } = await supabase.from('stock_ledgers').select('*').eq('order_id', id);
    let nMissing = 0, aBatch = null, aWh = null, aProd = null, hasARestore = false;
    for (const l of aLedgers || []) {
      if (l.reason === 'RESTORE_TEST_ABORTED_PICK') hasARestore = true;
      else nMissing += l.quantity_change;
      if (l.batch_id) aBatch = l.batch_id;
      if (l.warehouse_id) aWh = l.warehouse_id;
      if (l.product_id) aProd = l.product_id;
    }
    
    if (nMissing < 0 && !hasARestore) {
      const q = Math.abs(nMissing);
      const before = await getStockValues(aWh, aBatch, null, aProd);
      console.log(`ABNORMAL PLACED ${id} BEFORE: warehouse_stock: ${before.wStock?.quantity}, product_batch: ${before.bStock?.available_quantity}, placement: NOT DECREMENTED`);
      
      if (!DRY_RUN) {
        await supabase.from('warehouse_stock').update({ quantity: before.wStock.quantity + q }).eq('id', before.wStock.id);
        await supabase.from('product_batches').update({ available_quantity: before.bStock.available_quantity + q }).eq('id', aBatch);
        await supabase.from('stock_ledgers').insert({
          warehouse_id: aWh, product_id: aProd, quantity_change: q,
          reason: 'RESTORE_TEST_ABORTED_PICK', performed_by: adminId, batch_id: aBatch, order_id: id
        });
        
        const after = await getStockValues(aWh, aBatch, null, aProd);
        console.log(`ABNORMAL PLACED ${id} AFTER: warehouse_stock: ${after.wStock?.quantity}, product_batch: ${after.bStock?.available_quantity}`);
      }
    }
  }

  console.log('\n--- 3. Active Orders Audit & Cancellation ---');
  const { data: activeOrders } = await supabase.from('orders')
    .select('id, status, picker_id, driver_id, trip_id')
    .not('status', 'in', '("delivered","cancelled")');
  
  let ordersToCancel = [];
  let ordersToUnpack = [];
  let stagedOrderBefore = null;

  for (const o of activeOrders || []) {
    ordersToCancel.push(o.id);
    if (o.status === 'packed' || o.status === 'staged') {
      ordersToUnpack.push(o.id);
    }
    if (o.id === '5c48c3ff-d535-4556-b159-bf1b5ff6e01a') {
      const { data: stgLedg } = await supabase.from('stock_ledgers').select('*').eq('order_id', o.id);
      stagedOrderBefore = await getStockValues(stgLedg[0].warehouse_id, stgLedg[0].batch_id, null, stgLedg[0].product_id);
      console.log(`STAGED ORDER BEFORE: warehouse_stock: ${stagedOrderBefore.wStock?.quantity}, product_batch: ${stagedOrderBefore.bStock?.available_quantity}`);
    }
  }

  if (!DRY_RUN) {
    for (const id of ordersToCancel) {
      await supabase.rpc('admin_cancel_order', { p_order_id: id, p_reason: 'TEST CLEANUP' });
    }
    
    for (const id of ordersToUnpack) {
      const { data: unpacks } = await supabase.from('order_unpack_queue').select('id, status').eq('order_id', id).eq('status', 'pending');
      for (const u of unpacks || []) {
        await supabase.rpc('process_order_unpack', { p_unpack_id: u.id, p_disposition: 'restocked', p_user_id: adminId });
      }
    }
    
    if (stagedOrderBefore) {
      const { data: stgLedg } = await supabase.from('stock_ledgers').select('*').eq('order_id', '5c48c3ff-d535-4556-b159-bf1b5ff6e01a');
      const stagedOrderAfter = await getStockValues(stgLedg[0].warehouse_id, stgLedg[0].batch_id, null, stgLedg[0].product_id);
      console.log(`STAGED ORDER AFTER (via Unpack Restock): warehouse_stock: ${stagedOrderAfter.wStock?.quantity}, product_batch: ${stagedOrderAfter.bStock?.available_quantity}`);
    }
  }

  console.log('\n--- 4. Trips & Offers Cancellation ---');
  const { data: activeTrips } = await supabase.from('logistics_trips').select('id, status').not('status', 'in', '("completed","cancelled")');
  const { data: offers } = await supabase.from('driver_trip_offers').select('id, status').eq('status', 'pending');
  
  if (!DRY_RUN) {
    for (const t of activeTrips || []) {
       await supabase.from('logistics_trips').update({ status: 'cancelled' }).eq('id', t.id);
    }
    for (const f of offers || []) {
       await supabase.from('driver_trip_offers').update({ status: 'rejected' }).eq('id', f.id);
    }
  }

  if (!DRY_RUN) {
    console.log('\n--- 5. FINAL VERIFICATION ---');
    const { data: finalActiveOrders } = await supabase.from('orders').select('id').not('status', 'in', '("delivered","cancelled")');
    const { data: finalActiveTrips } = await supabase.from('logistics_trips').select('id').not('status', 'in', '("completed","cancelled")');
    const { data: finalPendingOffers } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
    const { data: finalActiveReservations } = await supabase.from('inventory_reservations').select('id').not('status', 'in', '("consumed","cancelled")');
    const { data: finalPendingUnpacks } = await supabase.from('order_unpack_queue').select('id').eq('status', 'pending');
    const { data: finalActivePickers } = await supabase.from('orders').select('picker_id').not('status', 'in', '("delivered","cancelled")').not('picker_id', 'is', null);
    
    console.log(`active orders = ${finalActiveOrders?.length || 0}`);
    console.log(`active trips = ${finalActiveTrips?.length || 0}`);
    console.log(`pending offers = ${finalPendingOffers?.length || 0}`);
    console.log(`active old inventory reservations = ${finalActiveReservations?.length || 0}`);
    console.log(`pending unpack jobs = ${finalPendingUnpacks?.length || 0}`);
    console.log(`active Picker assignments = ${finalActivePickers?.length || 0}`);
    console.log(`Driver active assignment = none (checked offline earlier)`);
  }
}

run().catch(console.error);
