require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function runQueries() {
  // 1. Query profile
  const { data: profile, error: err1 } = await supabase
    .from('profiles')
    .select('full_name, employee_id, role, warehouse_id, is_online')
    .eq('id', 'c678058e-9cea-4520-86d0-5e411d7c51e8')
    .single();
  console.log("PROFILE:", profile || err1);

  // 2. Trace order ending in F6E01A
  // We can query payment_transactions or whatever table the UI uses.
  // Wait, let's see where COD comes from.
  // I'll query driver_financial_ledger first.
  const { data: ledger, error: err2 } = await supabase
    .from('driver_financial_ledger')
    .select('*')
    .eq('driver_id', 'c678058e-9cea-4520-86d0-5e411d7c51e8')
    .eq('transaction_type', 'cod_collection');
  console.log("LEDGER (cod):", ledger || err2);

  // also query payment_transactions
  const { data: txs, error: err3 } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('driver_id', 'c678058e-9cea-4520-86d0-5e411d7c51e8');
  console.log("PAYMENT TXS:", txs || err3);
}

runQueries();
