const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: 'admin@flashgo.in', password: 'password123' });
  if (error) { 
    console.error('Login error:', error.message);
    // Try another admin password
    const { data: d2, error: e2 } = await supabase.auth.signInWithPassword({ email: 'admin@flashgo.in', password: 'flashgo-admin' });
    if (e2) {
      console.error('Login error 2:', e2.message);
      return;
    }
  }
  
  console.log('Fetching goods_receipts...');
  const { data: grs, error: grsErr } = await supabase.from('goods_receipts').select('*, procurement_order:procurement_orders(id), vendor:vendors(name), receiver:profiles(full_name), items:goods_receipt_items(id, quantity_received)');
  if (grsErr) {
    console.error('Query error:', grsErr);
  } else {
    console.log('Goods Receipts Count:', grs.length);
    console.log('Sample:', JSON.stringify(grs.slice(0, 2), null, 2));
  }
}

run();
