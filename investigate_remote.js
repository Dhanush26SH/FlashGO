import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjg2NjAsImV4cCI6MjA5NDk0NDY2MH0.m6ZZLat8I6sbvTcrB-dEN6cQio3hPIlUmEkxles3O6c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function investigate() {
  console.log("=== 1. Order Resolution ===");
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, status, warehouse_id, trip_id')
    .eq('order_number', 'FG-20260920-8B588')
    .single();
    
  if (orderErr) {
    console.error("Order error:", orderErr);
    return;
  }
  console.log(order);

  console.log("\n=== 2. Warehouse details ===");
  const { data: wh } = await supabase
    .from('warehouses')
    .select('id, name')
    .eq('id', order.warehouse_id)
    .single();
  console.log(wh);

  console.log("\n=== 3. Logistics Trip ===");
  if (order.trip_id) {
    const { data: trip } = await supabase
      .from('logistics_trips')
      .select('id, status, driver_id, created_at')
      .eq('id', order.trip_id)
      .single();
    console.log(trip);
  } else {
    const { data: tripFb } = await supabase
      .from('logistics_trips')
      .select('id, status, driver_id, created_at')
      .eq('order_id', order.id);
    console.log(tripFb);
  }

  console.log("\n=== 4. Driver1 Resolution ===");
  // auth.users is not accessible via anon key, but we can query profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_online, email')
    .eq('email', 'drivarrr1@gmail.com')
    .single();
    
  if (!profile) {
    console.log("Could not find profile for drivarrr1@gmail.com");
    return;
  }
  const driverId = profile.id;
  console.log("Profile:", profile);

  console.log("\n=== 5. Driver1 Session ===");
  const { data: session } = await supabase
    .from('driver_sessions')
    .select('id, status, staff_shift_id, active_vehicle_id')
    .eq('driver_id', driverId)
    .eq('status', 'active')
    .single();
  console.log("Session:", session);
  
  if (session?.staff_shift_id) {
    const { data: shift } = await supabase
      .from('staff_shifts')
      .select('id, warehouse_id, status')
      .eq('id', session.staff_shift_id)
      .single();
    console.log("Shift:", shift);
  }

  console.log("\n=== 6. Vehicle Compliance ===");
  if (session?.active_vehicle_id) {
    const { data: vehicle } = await supabase
      .from('driver_vehicles')
      .select('status, compliance_status')
      .eq('id', session.active_vehicle_id)
      .single();
    console.log("Vehicle:", vehicle);
  }

  console.log("\n=== 7. Driver Return Tasks ===");
  const { data: returnTasks } = await supabase
    .from('driver_return_tasks')
    .select('id, trip_id, warehouse_id, return_type, status, created_at, completed_at')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });
  console.log("Return Tasks:", returnTasks);

  console.log("\n=== 8. Dispatch Offers / Assignments ===");
  const { data: offers } = await supabase
    .from('dispatch_offers')
    .select('id, trip_id, driver_id, status, created_at')
    .or(`trip_id.eq.${order.trip_id || '00000000-0000-0000-0000-000000000000'},driver_id.eq.${driverId}`)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log("Offers:", offers);
}

investigate();
