import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STAGED_ORDER_ID = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';

async function run() {
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });
  const adminId = authData!.user!.id;

  // 1. Check all unpack queue rows for staged order (including non-pending)
  console.log('--- Unpack Queue for Staged Order (all statuses) ---');
  const { data: uq } = await supabase
    .from('order_unpack_queue')
    .select('*')
    .eq('order_id', STAGED_ORDER_ID);
  console.log(JSON.stringify(uq, null, 2));

  // 2. Check staged order current state
  console.log('\n--- Staged Order Current Status ---');
  const { data: staged } = await supabase
    .from('orders')
    .select('id, status, warehouse_id')
    .eq('id', STAGED_ORDER_ID)
    .single();
  console.log(JSON.stringify(staged));

  // 3. Check staged order net picking from ledgers
  console.log('\n--- Staged Order Stock Ledgers ---');
  const { data: stgLedg } = await supabase
    .from('stock_ledgers')
    .select('reason, quantity_change, warehouse_id, product_id, batch_id')
    .eq('order_id', STAGED_ORDER_ID);
  console.log(JSON.stringify(stgLedg, null, 2));
  const net = stgLedg?.filter(l => ['picking','picking_undo'].includes(l.reason)).reduce((a,l) => a+l.quantity_change, 0) || 0;
  console.log('Net from picking/picking_undo:', net);

  // 4. Current warehouse_stock for the staged product
  const pickLedg = stgLedg?.find(l => l.warehouse_id);
  if (pickLedg) {
    const { data: ws } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', pickLedg.warehouse_id).eq('product_id', pickLedg.product_id).single();
    const { data: bs } = await supabase.from('product_batches').select('available_quantity').eq('id', pickLedg.batch_id!).single();
    console.log(`\nCurrent warehouse_stock: ${ws?.quantity} | product_batch: ${bs?.available_quantity}`);
  }

  // 5. Check all reservations — show their order_id and whether that order is cancelled
  console.log('\n--- All Active Reservations ---');
  const { data: res } = await supabase
    .from('inventory_reservations')
    .select('id, status, order_id, product_id')
    .not('status', 'in', '("consumed","cancelled")');
  console.log(`Count: ${res?.length}`);
  
  if (res && res.length > 0) {
    const orderIds = [...new Set(res.map(r => r.order_id).filter(Boolean))];
    const { data: orders } = await supabase
      .from('orders')
      .select('id, status')
      .in('id', orderIds as string[]);
    
    const orderMap = Object.fromEntries(orders?.map(o => [o.id, o.status]) || []);
    for (const r of res) {
      const orderStatus = r.order_id ? (orderMap[r.order_id] || 'ORDER NOT FOUND') : 'NO ORDER ID';
      console.log(`  Reservation ${r.id} | order: ${r.order_id} | order_status: ${orderStatus} | res_status: ${r.status}`);
    }
  }

  // 6. If staged order unpack never ran, manually reconcile
  const uqAll = uq || [];
  const hasProcessed = uqAll.some(u => u.status === 'restocked');
  const hasPending = uqAll.some(u => u.status === 'pending');
  
  if (!hasProcessed && !hasPending && net < 0) {
    console.log('\n--- MANUAL STAGED ORDER STOCK RESTORATION ---');
    console.log(`No unpack job found. The cancellation trigger must have skipped it (order may not have warehouse_id).`);
    console.log(`Restoring net ${Math.abs(net)} units manually via RESTORE_TEST_ABORTED_PICK ledger.`);
    
    // Group by batch+warehouse+product
    const groups: Record<string, any> = {};
    for (const l of stgLedg?.filter(x => ['picking','picking_undo'].includes(x.reason)) || []) {
      const key = `${l.warehouse_id}:${l.product_id}:${l.batch_id}`;
      groups[key] = groups[key] || { wh: l.warehouse_id, prod: l.product_id, batch: l.batch_id, qty: 0 };
      groups[key].qty += l.quantity_change;
    }
    
    for (const g of Object.values(groups)) {
      if (g.qty < 0) {
        const restoreQty = Math.abs(g.qty);
        console.log(`  Restoring ${restoreQty} for product ${g.prod} in warehouse ${g.wh}, batch ${g.batch}`);
        
        // Check no prior restore
        const { data: prior } = await supabase.from('stock_ledgers').select('id').eq('order_id', STAGED_ORDER_ID).eq('reason', 'RESTORE_TEST_ABORTED_PICK').limit(1);
        if (prior && prior.length > 0) {
          console.log('  Prior restore exists — skipping (idempotent).');
          continue;
        }

        const { data: ws } = await supabase.from('warehouse_stock').select('quantity, id').eq('warehouse_id', g.wh).eq('product_id', g.prod).single();
        const { data: bs } = await supabase.from('product_batches').select('available_quantity').eq('id', g.batch).single();
        
        console.log(`  BEFORE: warehouse_stock: ${ws?.quantity}, batch: ${bs?.available_quantity}`);
        
        await supabase.from('warehouse_stock').update({ quantity: ws!.quantity + restoreQty }).eq('id', ws!.id);
        await supabase.from('product_batches').update({ available_quantity: bs!.available_quantity + restoreQty }).eq('id', g.batch);
        await supabase.from('stock_ledgers').insert({
          warehouse_id: g.wh, product_id: g.prod, quantity_change: restoreQty,
          reason: 'RESTORE_TEST_ABORTED_PICK', performed_by: adminId, batch_id: g.batch, order_id: STAGED_ORDER_ID
        });
        
        const { data: wsAfter } = await supabase.from('warehouse_stock').select('quantity').eq('warehouse_id', g.wh).eq('product_id', g.prod).single();
        const { data: bsAfter } = await supabase.from('product_batches').select('available_quantity').eq('id', g.batch).single();
        console.log(`  AFTER: warehouse_stock: ${wsAfter?.quantity}, batch: ${bsAfter?.available_quantity}`);
      }
    }
  }

  // 7. Release orphaned reservations (cancelled order's reservations that weren't released by trigger)
  console.log('\n--- Releasing Orphaned Reservations ---');
  const { data: resAgain } = await supabase
    .from('inventory_reservations')
    .select('id, order_id, status')
    .not('status', 'in', '("consumed","cancelled")');
    
  if (resAgain && resAgain.length > 0) {
    const orderIds2 = [...new Set(resAgain.map(r => r.order_id).filter(Boolean))];
    const { data: orders2 } = await supabase.from('orders').select('id, status').in('id', orderIds2 as string[]);
    const cancelledOrderIds = new Set(orders2?.filter(o => o.status === 'cancelled').map(o => o.id) || []);
    // Also include order_ids with no matching order (deleted)
    const existingOrderIds = new Set(orders2?.map(o => o.id) || []);
    
    let released = 0;
    for (const r of resAgain) {
      const shouldRelease = (r.order_id && cancelledOrderIds.has(r.order_id)) || (r.order_id && !existingOrderIds.has(r.order_id));
      if (shouldRelease) {
        await supabase.from('inventory_reservations').update({ status: 'cancelled' }).eq('id', r.id);
        released++;
      }
    }
    console.log(`Released ${released} orphaned reservations.`);
  }

  // Final
  console.log('\n--- FINAL STATE ---');
  const { data: f1 } = await supabase.from('orders').select('id').not('status', 'in', '("delivered","cancelled")');
  const { data: f2 } = await supabase.from('logistics_trips').select('id').not('status', 'in', '("completed","cancelled")');
  const { data: f3 } = await supabase.from('driver_trip_offers').select('id').eq('status', 'pending');
  const { data: f4 } = await supabase.from('inventory_reservations').select('id').not('status', 'in', '("consumed","cancelled")');
  const { data: f5 } = await supabase.from('order_unpack_queue').select('id').eq('status', 'pending');
  const { data: f6 } = await supabase.from('orders').select('picker_id').not('status', 'in', '("delivered","cancelled")').not('picker_id', 'is', null);
  
  console.log(`active orders          = ${f1?.length || 0}`);
  console.log(`active trips           = ${f2?.length || 0}`);
  console.log(`pending offers         = ${f3?.length || 0}`);
  console.log(`active reservations    = ${f4?.length || 0}`);
  console.log(`pending unpack jobs    = ${f5?.length || 0}`);
  console.log(`active picker assigns  = ${f6?.length || 0}`);
  console.log(`Driver session         = preserved (not touched)`);
}

run().catch(console.error);
