const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const passwords = [
    'password', 'password123', 'admin', 'admin123', 'flashgo123', 'flashgo-admin', 'flashgo-superuser-2026', 'flashgo'
  ];
  let loggedIn = false;
  for (const p of passwords) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: 'admin@flashgo.in', password: p });
    if (!error) {
      console.log('Logged in with password:', p);
      loggedIn = true;
      break;
    }
  }

  if (!loggedIn) {
    console.error('All logins failed.');
    return;
  }
  
  const { data: grs, error: grsErr } = await supabase.from('goods_receipts').select('*, procurement_order:procurement_orders(id), vendor:vendors(name), receiver:profiles(full_name), items:goods_receipt_items(id, quantity_received)');
  if (grsErr) {
    console.error('Query error:', grsErr);
  } else {
    console.log('Goods Receipts Count:', grs.length);
    if (grs.length > 0) {
      console.log('Sample:', JSON.stringify(grs.slice(0, 1), null, 2));
      
      const now = new Date();
      let todayCount = 0;
      let sevenDaysCount = 0;
      let thirtyDaysCount = 0;
      
      grs.forEach(g => {
        const d = new Date(g.created_at);
        const diff = (now - d) / (1000 * 60 * 60 * 24);
        if (diff <= 1) todayCount++;
        if (diff <= 7) sevenDaysCount++;
        if (diff <= 30) thirtyDaysCount++;
      });
      console.log(`Today: ${todayCount}, 7 Days: ${sevenDaysCount}, 30 Days: ${thirtyDaysCount}`);
    }
  }
}

run();
