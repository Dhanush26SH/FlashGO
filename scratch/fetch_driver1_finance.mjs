import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);

async function run() {
  console.log("Using Service Role Key to bypass RLS...");

  const { data: driverData, error: driverErr } = await adminClient.from('profiles').select('id, full_name, employee_id').ilike('full_name', '%Driver1%').limit(1);
  if (driverErr || !driverData || driverData.length === 0) {
      console.log("Failed to find Driver1", driverErr);
      return;
  }

  const driverId = driverData[0].id;
  console.log("Driver1:", driverData[0]);

  const { data: ledger, error: ledgerErr } = await adminClient
    .from('driver_financial_ledger')
    .select('*')
    .eq('driver_id', driverId)
    .gte('occurred_at', '2026-09-14T00:00:00Z')
    .lte('occurred_at', '2026-09-20T23:59:59Z')
    .order('occurred_at', { ascending: true });

  if (ledgerErr) {
      console.error("Failed to fetch ledger", ledgerErr);
      return;
  }

  console.log(`\nLedger entries for period (Total ${ledger.length}):`);
  
  let earnings = 0;
  let deductions = 0;
  
  ledger.forEach(entry => {
      const amt = Number(entry.amount);
      console.log(`[${entry.occurred_at}] ${entry.transaction_type}: ${amt} (Ref: ${entry.source_reference_id} | Order: ${entry.order_id}) - ${entry.description}`);
      if (['delivery_earning', 'customer_tip', 'incentive'].includes(entry.transaction_type) || (entry.transaction_type === 'adjustment' && amt > 0)) {
        earnings += amt;
      } else if (['penalty', 'adjustment'].includes(entry.transaction_type) && amt < 0) {
        deductions += Math.abs(amt);
      }
  });

  console.log(`\nTotals: Earnings = ${earnings}, Deductions = ${deductions}, Net = ${earnings - deductions}`);
}

run();
