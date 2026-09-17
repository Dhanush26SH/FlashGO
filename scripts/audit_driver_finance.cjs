const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean).map(l => l.split('=')));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("== RUNNING AUDIT FOR DRIVER1 ==");
  
  // 1. Log in as driver1
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'driver1@flashgo.com',
    password: 'password123'
  });
  
  if (authError) {
    console.error("Auth Error:", authError.message);
    return;
  }
  
  console.log("Successfully logged in as", authData.user.email);
  const driverId = authData.user.id;

  // 2. Query Driver Ledger
  const { data: ledgerRes, error: err2 } = await supabase
    .from('driver_financial_ledger')
    .select('*')
    .eq('driver_id', driverId)
    .gte('occurred_at', '2026-09-14T00:00:00Z')
    .lte('occurred_at', '2026-09-20T23:59:59Z')
    .order('occurred_at', { ascending: true });
    
  if (err2) {
    console.error("Error fetching ledger:", err2);
    return;
  }
  
  console.log(`\nLedger Entries for ${driverId} (14/09 - 20/09):`);
  console.log(JSON.stringify(ledgerRes, null, 2));

  // 3. Summarize
  let earnings = 0;
  let deductions = 0;
  
  if (ledgerRes && ledgerRes.length > 0) {
    ledgerRes.forEach(row => {
      const amt = Number(row.amount);
      if (['delivery_earning', 'customer_tip', 'incentive'].includes(row.transaction_type) || amt > 0) {
        earnings += amt;
      } else if (['penalty', 'deduction', 'adjustment'].includes(row.transaction_type) || amt < 0) {
        deductions += amt;
      }
    });
  }
  
  console.log(`\nTotals: Earnings = ${earnings}, Deductions = ${deductions}, Net = ${earnings + deductions}`);
}

run();
