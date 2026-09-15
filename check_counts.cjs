require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function checkTables() {
  const queries = [
    { name: 'picker_settlement_batches', table: 'picker_settlement_batches' },
    { name: 'picker_settlements', table: 'picker_settlements' },
    { name: 'picker_settlement_items', table: 'picker_settlement_items' },
    { name: 'warehouse_staff_salary_configs', table: 'warehouse_staff_salary_configs' },
    { name: 'warehouse_staff_payroll', table: 'warehouse_staff_payroll' },
    { name: 'payroll_adjustments', table: 'payroll_adjustments' },
    { name: 'driver_financial_ledger', table: 'driver_financial_ledger' },
    { name: 'driver_pocket_balance', table: 'driver_pocket_balance' }
  ];

  console.log("Checking row counts:");
  for (const q of queries) {
    const { count, error } = await supabase.from(q.table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`- ${q.name}: ERROR (${error.message})`);
    } else {
      console.log(`- ${q.name}: ${count} rows`);
    }
  }
}

checkTables();
