import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  console.log('--- STARTING AUTOMATED TESTS ---');

  // 1. Create a fake driver for testing
  const { data: driver, error: driverErr } = await supabase.from('profiles').insert({
    full_name: 'Test Deficit Driver',
    email: 'test_deficit_driver@flashgo.com',
    role: 'driver',
    is_pending_staff: false
  }).select().single();
  
  if (driverErr) {
    console.error('Failed to create driver:', driverErr);
    return;
  }
  
  const driverId = driver.id;

  // 2. Create a fake warehouse
  const { data: wh, error: whErr } = await supabase.from('warehouses').insert({
    name: 'Test Warehouse',
    location: 'Test Location',
    city: 'Test City',
    state: 'Test State',
    pincode: '000000',
    type: 'dark_store',
    status: 'active'
  }).select().single();

  if (whErr) {
    console.error('Failed to create warehouse:', whErr);
    return;
  }
  
  const warehouseId = wh.id;

  // We need to set the driver's warehouse_id so the settlement RPC allows it
  await supabase.from('profiles').update({ warehouse_id: warehouseId }).eq('id', driverId);

  try {
    // ---------------------------------------------------------
    // TEST CASE 1: −₹40 → +₹100 ⇒ payout ₹60, remaining ₹0
    // ---------------------------------------------------------
    console.log('\\n[TEST 1] -₹40 -> +₹100');
    // Week 1: 2026-09-07 to 2026-09-13
    await supabase.from('driver_financial_ledger').insert([
      { driver_id: driverId, amount: -40, transaction_type: 'penalty', occurred_at: '2026-09-08T10:00:00Z', reference_id: 'W1-P' }
    ]);
    
    // Generate Week 1 Settlement
    const { data: batch1, error: err1 } = await supabase.rpc('create_driver_settlement_batch', {
      p_warehouse_id: warehouseId,
      p_week_start: '2026-09-07',
      p_staff_ids: [driverId]
    });
    console.log('W1 Generation:', err1 ? 'FAILED' : 'SUCCESS');
    
    // Week 2: 2026-09-14 to 2026-09-20
    await supabase.from('driver_financial_ledger').insert([
      { driver_id: driverId, amount: 100, transaction_type: 'delivery_earning', occurred_at: '2026-09-15T10:00:00Z', reference_id: 'W2-E' }
    ]);
    
    // Generate Week 2 Settlement
    const { data: batch2, error: err2 } = await supabase.rpc('create_driver_settlement_batch', {
      p_warehouse_id: warehouseId,
      p_week_start: '2026-09-14',
      p_staff_ids: [driverId]
    });
    
    const { data: w2Set } = await supabase.from('driver_settlements').select('*').eq('driver_id', driverId).eq('week_start', '2026-09-14').single();
    console.log('W2 Carried Deficit:', w2Set.carried_deficit);
    console.log('W2 Deficit Recovered:', w2Set.deficit_recovered);
    console.log('W2 Net Amount (Payout):', w2Set.net_amount);
    console.log('W2 Remaining Deficit:', w2Set.remaining_deficit);


    // ---------------------------------------------------------
    // TEST CASE 4: W2 has unsettled ledger activity, generating W3 is REJECTED
    // ---------------------------------------------------------
    console.log('\\n[TEST 4] Unsettled W3 blocking W4 generation');
    // Insert into W3
    await supabase.from('driver_financial_ledger').insert([
      { driver_id: driverId, amount: 50, transaction_type: 'delivery_earning', occurred_at: '2026-09-22T10:00:00Z', reference_id: 'W3-E' }
    ]);
    
    // Try to generate W4 (skipping W3)
    const { error: errSkip } = await supabase.rpc('create_driver_settlement_batch', {
      p_warehouse_id: warehouseId,
      p_week_start: '2026-09-28',
      p_staff_ids: [driverId]
    });
    console.log('W4 Generation Error:', errSkip?.message);


    // ---------------------------------------------------------
    // TEST CASE 5: W3 settled, W4 has zero activity, W5 generated successfully
    // ---------------------------------------------------------
    console.log('\\n[TEST 5] Empty W4 allows W5 generation');
    // Settle W3
    await supabase.rpc('create_driver_settlement_batch', { p_warehouse_id: warehouseId, p_week_start: '2026-09-21', p_staff_ids: [driverId] });
    
    // W4 (2026-09-28) has zero activity.
    // Insert into W5
    await supabase.from('driver_financial_ledger').insert([
      { driver_id: driverId, amount: -30, transaction_type: 'penalty', occurred_at: '2026-10-06T10:00:00Z', reference_id: 'W5-P' }
    ]);
    
    // Generate W5
    const { error: errW5 } = await supabase.rpc('create_driver_settlement_batch', { p_warehouse_id: warehouseId, p_week_start: '2026-10-05', p_staff_ids: [driverId] });
    console.log('W5 Generation:', errW5 ? 'FAILED' : 'SUCCESS');


    // ---------------------------------------------------------
    // TEST CASE 6: Duplicate settlement idempotently handled
    // ---------------------------------------------------------
    console.log('\\n[TEST 6] Duplicate settlement');
    const { data: dupData, error: dupErr } = await supabase.rpc('create_driver_settlement_batch', { p_warehouse_id: warehouseId, p_week_start: '2026-10-05', p_staff_ids: [driverId] });
    console.log('Duplicate batch failed count:', dupData?.failed_count); // should be 1 because it skipped


    // ---------------------------------------------------------
    // TEST CASE 7: Modification of PAID settlement rejected
    // ---------------------------------------------------------
    console.log('\\n[TEST 7] Marking paid settlement as paid again');
    // Pay W2
    const w2Id = w2Set.id;
    await supabase.rpc('mark_driver_settlement_paid', { p_settlement_id: w2Id, p_payment_reference: 'REF-W2', p_payment_method: 'bank_transfer', p_payment_provider: 'test' });
    
    // Try to pay again
    const { error: payErr2 } = await supabase.rpc('mark_driver_settlement_paid', { p_settlement_id: w2Id, p_payment_reference: 'REF-W2-AGAIN', p_payment_method: 'bank_transfer', p_payment_provider: 'test' });
    console.log('Duplicate Pay Error:', payErr2?.message);

  } finally {
    // Cleanup
    console.log('\\nCleaning up test data...');
    await supabase.from('driver_financial_ledger').delete().eq('driver_id', driverId);
    await supabase.from('driver_settlement_batches').delete().eq('warehouse_id', warehouseId);
    await supabase.from('profiles').delete().eq('id', driverId);
    await supabase.from('warehouses').delete().eq('id', warehouseId);
  }
}

runTests();
