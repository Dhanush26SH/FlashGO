require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function runQueries() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@flashgo.com',
    password: 'password123'
  });
  
  if (authErr) {
    console.log("Auth failed 1:", authErr.message);
    const { data: authData2, error: authErr2 } = await supabase.auth.signInWithPassword({
      email: 'admin@flashgo.com',
      password: 'password'
    });
    if (authErr2) {
      console.log("Auth failed 2:", authErr2.message);
      return;
    }
    console.log("Auth success 2!");
  } else {
    console.log("Auth success 1!");
  }

  // 1. Query profile
  const { data: profile, error: err1 } = await supabase
    .from('profiles')
    .select('full_name, employee_id, role, warehouse_id, is_online')
    .eq('id', 'c678058e-9cea-4520-86d0-5e411d7c51e8')
    .single();
  console.log("PROFILE:", profile || err1);

  // 2. Trace order ending in F6E01A from cod_collections
  const { data: cod, error: err2 } = await supabase
    .from('cod_collections')
    .select('order_id, driver_id, amount, status')
    .eq('driver_id', 'c678058e-9cea-4520-86d0-5e411d7c51e8');
  console.log("COD COLLECTIONS:", cod || err2);

  if (cod && cod.length > 0) {
    const orderId = cod[0].order_id;
    const { data: order, error: err3 } = await supabase
      .from('orders')
      .select('id, driver_id, status, trip_id')
      .eq('id', orderId)
      .single();
    console.log("ORDER RECORD:", order || err3);
  }
}

runQueries();
