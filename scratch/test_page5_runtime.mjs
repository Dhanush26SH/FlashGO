import { createClient } from '@supabase/supabase-js';
import assert from 'assert';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const adminClient = createClient(SUPABASE_URL, ANON_KEY);
const customerClient = createClient(SUPABASE_URL, ANON_KEY);

async function runTests() {
  console.log('--- RUNNING PAGE 5 VERIFICATION ---');

  // 1. Auth & Setup
  await adminClient.auth.signInWithPassword({ email: 'admin123@flashgo.com', password: 'Test1234!' });
  await customerClient.auth.signInWithPassword({ email: 'john@example.com', password: 'password123' });

  const { data: { user: adminUser } } = await adminClient.auth.getUser();
  const { data: { user: customerUser } } = await customerClient.auth.getUser();

  const { data: whData, error: whErr } = await adminClient.from('warehouses').select('*').eq('is_active', true).limit(1);
  if (whErr) console.error(whErr);
  const warehouse = whData[0];
  console.log(`Testing against Warehouse: ${warehouse.name} (${warehouse.id})`);

  // --- 2. Inventory Truth ---
  console.log('Test: Inventory Truth');
  let { data: inventory } = await adminClient.rpc('admin_get_warehouse_inventory', { p_warehouse_id: warehouse.id });
  let product = inventory.find(p => p.physical_stock >= 10);
  assert(product, 'Could not find a product with at least 10 physical stock');
  
  console.log(`Selected Product: ${product.name} (Physical: ${product.physical_stock}, Reserved: ${product.reserved_stock}, Sellable: ${product.sellable_stock})`);
  assert(product.physical_stock - product.reserved_stock === product.sellable_stock, 'Sellable stock formula mismatch');
  console.log('PASS: Sellable stock accurately calculated');

  // --- 3. Reservation Lifecycle ---
  console.log('\nTest: Reservation Lifecycle');
  let startReserved = product.reserved_stock;
  let startSellable = product.sellable_stock;

  let cartItems = [{ product_id: product.product_id, quantity: 2, price: product.price }];
  let { data: checkoutId, error: checkoutErr } = await customerClient.rpc('process_checkout', {
    p_user_id: customerUser.id,
    p_address: 'Test Address',
    p_delivery_speed: 'standard',
    p_payment_method: 'card',
    p_items: cartItems
  });
  if (checkoutErr) throw checkoutErr;
  console.log(`Checkout created order: ${checkoutId}`);

  // Re-fetch inventory
  let { data: inv2 } = await adminClient.rpc('admin_get_warehouse_inventory', { p_warehouse_id: warehouse.id });
  let prod2 = inv2.find(p => p.product_id === product.product_id);
  assert(prod2.reserved_stock === startReserved + 2, 'Reserved stock did not increase');
  assert(prod2.sellable_stock === startSellable - 2, 'Sellable stock did not decrease');
  assert(prod2.physical_stock === product.physical_stock, 'Physical stock should not change during reservation');
  console.log('PASS: Reservation lifecycle verified');

  // Cancel Order
  await adminClient.rpc('cancel_order', { p_order_id: checkoutId, p_admin_id: adminUser.id, p_reason: 'Test cancellation' });
  let { data: inv3 } = await adminClient.rpc('admin_get_warehouse_inventory', { p_warehouse_id: warehouse.id });
  let prod3 = inv3.find(p => p.product_id === product.product_id);
  assert(prod3.reserved_stock === startReserved, 'Reserved stock did not reset after cancel');
  assert(prod3.sellable_stock === startSellable, 'Sellable stock did not reset after cancel');
  assert(prod3.physical_stock === product.physical_stock, 'Physical stock changed after cancel?');
  console.log('PASS: Reservation release verified');

  // --- 4. Security ---
  console.log('\nTest: Security (Unauthorized Access)');
  let { error: secErr } = await customerClient.rpc('admin_get_warehouse_inventory', { p_warehouse_id: warehouse.id });
  assert(secErr && secErr.message.includes('Unauthorized'), 'Customer was able to read admin inventory!');
  console.log('PASS: Customer RPC blocked');

  // --- 5. Negative / Protection ---
  console.log('\nTest: Negative Stock Protection via Adjust Batch');
  let { data: batches } = await adminClient.rpc('admin_get_product_batches', { p_warehouse_id: warehouse.id });
  let batch = batches.find(b => b.product_id === product.product_id && b.available_quantity > 0);
  
  if (batch) {
    let { error: negErr } = await adminClient.rpc('adjust_batch_stock', {
      p_warehouse_id: warehouse.id,
      p_product_id: product.product_id,
      p_batch_id: batch.batch_id,
      p_quantity_change: -9999, // Way more than physical
      p_reason: 'damaged',
      p_staff_id: adminUser.id
    });
    assert(negErr, 'System allowed negative stock adjustment!');
    console.log('PASS: Negative stock prevented');
  } else {
    console.log('SKIP: No batch found to test negative stock');
  }

  // --- 6. Ledger Verification ---
  console.log('\nTest: Ledger Updates');
  let { data: ledgerPre } = await adminClient.rpc('admin_get_stock_ledgers', { p_warehouse_id: warehouse.id });
  
  if (batch) {
    await adminClient.rpc('adjust_batch_stock', {
      p_warehouse_id: warehouse.id,
      p_product_id: product.product_id,
      p_batch_id: batch.batch_id,
      p_quantity_change: -1,
      p_reason: 'damaged',
      p_staff_id: adminUser.id
    });
    
    let { data: ledgerPost } = await adminClient.rpc('admin_get_stock_ledgers', { p_warehouse_id: warehouse.id });
    assert(ledgerPost.length > ledgerPre.length, 'Ledger did not insert row');
    let latest = ledgerPost[0];
    assert(latest.reason === 'damaged' && latest.quantity_change === -1, 'Ledger row data incorrect');
    console.log('PASS: Ledger updated for adjustment');
    
    // Check damaged quantity in batches
    let { data: batches2 } = await adminClient.rpc('admin_get_product_batches', { p_warehouse_id: warehouse.id });
    let batch2 = batches2.find(b => b.batch_id === batch.batch_id);
    assert(batch2.damaged_quantity > 0, 'Damaged quantity not calculated correctly in batches');
    console.log('PASS: Batch damaged/expired calculation works');
  }

  console.log('\n--- ALL RUNTIME TESTS PASSED ---');
}

runTests().catch(console.error);
