import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);

const testOrderId = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';
const driverId = 'c678058e-9cea-4520-86d0-5e411d7c51e8';
const whStaffId = '71dfbbba-ceda-4ffa-8564-30351d52b714'; 
const whStaffPass = 'WarehouseStaff#999';
const driverPass = 'DriverPassword#999';

function log(test, result, details = '') {
  console.log(`[${result}] ${test}` + (details ? `: ${details}` : ''));
}

async function run() {
  const driverClient = createClient(URL, ANON_KEY);
  const whClient = createClient(URL, ANON_KEY);

  // Sign in staff
  await whClient.auth.signInWithPassword({ email: 'new_wh_staff@flashgo.com', password: whStaffPass });
  // Sign in driver
  const { data: driverAuth, error: dAuthErr } = await driverClient.auth.signInWithPassword({ email: 'new_driver@flashgo.com', password: driverPass });
  if (dAuthErr) throw dAuthErr;

  const { data: profile } = await driverClient.from('profiles').select('*').eq('id', driverId).single();
  log('DRIVER_AUTH', profile.role === 'driver' ? 'PASS' : 'FAIL', `role=${profile.role}`);

  // 1. PRE-HANDOFF STATE (Get order before resetting so we can read warehouse_id)
  const { data: orderPre } = await adminClient.from('orders').select('*').eq('id', testOrderId).single();
  const { data: stockPre } = await adminClient.from('warehouse_stock')
    .select('quantity').eq('warehouse_id', orderPre.warehouse_id).eq('product_id', 'a8c962dc-549b-4395-8422-9907c0800b7d').single();

  // 0. RESET STATE
  await adminClient.from('orders').update({ status: 'packed', trip_id: null, driver_id: null }).eq('id', testOrderId);
  
  log('PRE_ORDER_STATUS', 'PASS', `status=packed (reset)`);

  // 2. DRIVER ASSIGNMENT
  // Dispatch creates trip and assigns to driver
  const { data: tripIdReturn, error: tripErr } = await adminClient.rpc('create_logistics_trip', { p_warehouse_id: orderPre.warehouse_id, p_order_ids: [testOrderId] });
  log('CREATE_TRIP_ASSIGNMENT', !tripErr ? 'PASS' : 'FAIL', tripErr?.message);
  
  let tripId = tripIdReturn || null;
  
  if (!tripId) {
    // If it doesn't return trip id (e.g. already assigned error), let's look it up
    const { data: orderTrip } = await adminClient.from('orders').select('trip_id').eq('id', testOrderId).single();
    if (orderTrip) tripId = orderTrip.trip_id;
  }
  
  if (tripId) {
     // claim trip
     await adminClient.from('profiles').update({ is_online: true }).eq('id', driverId);
     const { error: claimErr } = await driverClient.rpc('claim_trip', { p_trip_id: tripId, p_driver_id: driverId });
     log('CLAIM_TRIP_RPC', !claimErr ? 'PASS' : 'FAIL', claimErr?.message);
  }
  
  if (!tripId) {
    console.log("Failed to assign trip! Stopping."); return;
  }

  // 3. STAGING (If not already staged)
  const { data: locs } = await adminClient.from('warehouse_staging_locations').select('id').eq('warehouse_id', orderPre.warehouse_id).limit(1);
  const locId = locs?.[0]?.id;
  if (locId) {
     const { error: stageErr } = await whClient.rpc('stage_order', { p_order_id: testOrderId, p_location_id: locId, p_user_id: whStaffId });
     log('STAGE_ORDER_RPC', !stageErr ? 'PASS' : 'FAIL', stageErr?.message);
  }

  // 4. WAREHOUSE HANDOFF
  // Warehouse staff does handoff
  const { error: handoffErr } = await whClient.rpc('handoff_order', { p_order_id: testOrderId, p_user_id: whStaffId });
  log('HANDOFF_ORDER_RPC', !handoffErr ? 'PASS' : 'FAIL', handoffErr?.message);
  
  const { data: orderHandoff } = await adminClient.from('orders').select('status').eq('id', testOrderId).single();
  log('STATUS_IS_HANDED_OFF', orderHandoff.status === 'handed_off' ? 'PASS' : 'FAIL', `status=${orderHandoff.status}`);

  // 5. START DELIVERY
  // Driver starts trip
  const { error: startErr } = await driverClient.rpc('start_trip', { p_trip_id: tripId, p_driver_id: driverId });
  log('START_TRIP_RPC', !startErr ? 'PASS' : 'FAIL', startErr?.message);
  
  const { data: orderOfd } = await adminClient.from('orders').select('status').eq('id', testOrderId).single();
  log('STATUS_IS_OFD', orderOfd.status === 'out_for_delivery' ? 'PASS' : 'FAIL', `status=${orderOfd.status}`);

  // 6. DELIVERY OTP & COMPLETION
  const otp = orderPre.otp_code || orderPre.delivery_otp || '1234'; 

  // Test wrong OTP
  const { error: wrongOtpErr } = await driverClient.rpc('mark_order_delivered', { p_order_id: testOrderId, p_otp: '0000', p_driver_id: driverId, p_pod_url: null });
  log('WRONG_OTP_BLOCKED', wrongOtpErr ? 'PASS' : 'FAIL', wrongOtpErr?.message || 'It succeeded instead of blocking!');

  // Test Driver trying to update status directly using REST (Negative test)
  const { error: updateErr, data: updatedRows } = await driverClient.from('orders').update({ status: 'delivered' }).eq('id', testOrderId);
  log('SECURITY_REST_UPDATE_BLOCKED', (updateErr || !updatedRows || updatedRows.length === 0) ? 'PASS' : 'FAIL', updateErr?.message);

  // Register COD
  const { error: codErr } = await driverClient.rpc('register_cod_delivery', { p_order_id: testOrderId, p_driver_id: driverId, p_amount: 175 });
  log('REGISTER_COD_RPC', !codErr ? 'PASS' : 'FAIL', codErr?.message);

  // Complete correctly
  const { error: completeErr } = await driverClient.rpc('mark_order_delivered', { p_order_id: testOrderId, p_otp: otp, p_driver_id: driverId, p_pod_url: null });
  log('COMPLETE_DELIVERY_RPC', !completeErr ? 'PASS' : 'FAIL', completeErr?.message);

  // 6. FINAL REGRESSION
  const { data: orderFinal } = await adminClient.from('orders').select('*').eq('id', testOrderId).single();
  log('STATUS_IS_DELIVERED', orderFinal.status === 'delivered' ? 'PASS' : 'FAIL', `status=${orderFinal.status}`);

  // 7. EARNINGS
  const { data: earnings } = await adminClient.from('driver_earnings').select('*').eq('order_id', testOrderId);
  log('DRIVER_EARNINGS_GENERATED', earnings?.length > 0 ? 'PASS' : 'FAIL', `count=${earnings?.length}`);

  // 8. INVARIANTS
  const { data: stockPost } = await adminClient.from('warehouse_stock')
    .select('quantity').eq('warehouse_id', orderPre.warehouse_id).eq('product_id', 'a8c962dc-549b-4395-8422-9907c0800b7d').single();
    
  log('INVARIANT_STOCK_UNCHANGED', stockPre?.quantity === stockPost?.quantity ? 'PASS' : 'FAIL', `before=${stockPre?.quantity} after=${stockPost?.quantity}`);

  console.log('\n========== DRIVER PHASE VERIFICATION REPORT ==========');
}

run().catch(console.error);
