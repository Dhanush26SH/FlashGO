import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !serviceKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const admin = createClient(supabaseUrl, serviceKey);

async function runTest() {
  console.log("Starting Concurrency Test...");

  // 1. Sign in as test driver
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'driver1@flashgo.in',
    password: 'password123'
  });

  if (authErr) {
    console.error("Auth error:", authErr.message);
    return;
  }
  const driverId = authData.user.id;

  // 2. Setup Dummy Trip and Order using Admin
  // Find a warehouse
  const { data: wh } = await admin.from('warehouses').select('id').limit(1).single();
  
  // Find a customer
  const { data: cust } = await admin.from('profiles').select('id').eq('role', 'customer').limit(1).single();

  // Insert trip
  const { data: trip, error: tripErr } = await admin.from('logistics_trips').insert({
    warehouse_id: wh.id,
    driver_id: driverId,
    status: 'in_transit',
    arrived_at: new Date().toISOString(),
    route_distance_meters: 2000,
  }).select().single();

  if (tripErr) {
    console.error("Trip insert error:", tripErr);
    return;
  }

  // Insert order
  const { data: order, error: orderErr } = await admin.from('orders').insert({
    customer_id: cust.id,
    warehouse_id: wh.id,
    trip_id: trip.id,
    status: 'in_transit',
    payment_method: 'cod',
    total_amount: 500, // < 1000 so no OTP
    order_number: 'TEST-COD-' + Date.now(),
    delivery_lat: 12.9,
    delivery_lng: 77.5
  }).select().single();

  if (orderErr) {
    console.error("Order insert error:", orderErr);
    return;
  }

  console.log(`Created Trip: ${trip.id}, Order: ${order.id}`);

  // 3. Fire Concurrent RPC Calls using Driver token
  console.log("Firing two concurrent completion calls...");
  
  const call1 = supabase.rpc('driver_complete_delivery', {
    p_trip_id: trip.id,
    p_cod_collected: true
  });
  
  const call2 = supabase.rpc('driver_complete_delivery', {
    p_trip_id: trip.id,
    p_cod_collected: true
  });

  const results = await Promise.allSettled([call1, call2]);
  console.log("Results of concurrent calls:", results.map(r => r.status === 'fulfilled' ? r.value.data || r.value.error : r.reason));

  // 4. Verify exactly once semantics
  const { data: ledgerEntries } = await admin
    .from('driver_financial_ledger')
    .select('*')
    .eq('source_reference_id', order.id)
    .eq('transaction_type', 'cod_collection');

  console.log(`\n--- Verification ---`);
  console.log(`Found ${ledgerEntries.length} cod_collection ledger entries (Expected: 1).`);
  
  if (ledgerEntries.length !== 1) {
    console.error("FAILED: Concurrency led to duplicate or missing ledger entries.");
    console.dir(ledgerEntries);
  } else {
    console.log("SUCCESS: Exactly one ledger entry created.");
    console.log(`Liability Amount: ${ledgerEntries[0].amount}`);
  }

  const { data: updatedTrip } = await admin.from('logistics_trips').select('status, delivered_at').eq('id', trip.id).single();
  console.log(`Trip Status: ${updatedTrip.status}, Delivered At: ${updatedTrip.delivered_at}`);

  console.log("Cleaning up...");
  await admin.from('orders').delete().eq('id', order.id);
  await admin.from('logistics_trips').delete().eq('id', trip.id);
  await admin.from('driver_financial_ledger').delete().eq('source_reference_id', order.id);

  console.log("Test Finished.");
}

runTest();
