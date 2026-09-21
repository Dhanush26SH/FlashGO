import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    // Get Driver1
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, role').eq('role', 'driver').ilike('full_name', 'Driver1');
    if (pErr || profiles.length === 0) {
      console.log('Driver1 not found');
      return;
    }
    const driverId = profiles[0].id;
    console.log('Driver1 ID:', driverId);

    // Period Boundaries
    const p_week_start = '2026-09-14';
    const tzOffset = 5.5 * 3600000;
    
    // Check if settlement exists
    const { data: settlements } = await supabase
      .from('driver_settlements')
      .select('*')
      .eq('driver_id', driverId)
      .eq('week_start', p_week_start);
      
    console.log('\n--- Existing Settlements ---');
    console.log(settlements);

    // Get Ledger rows for IST 2026-09-14 to 2026-09-21
    const startUtc = new Date(new Date('2026-09-14T00:00:00Z').getTime() - tzOffset).toISOString();
    const endUtc = new Date(new Date('2026-09-21T00:00:00Z').getTime() - tzOffset).toISOString();

    const { data: ledgers, error: lErr } = await supabase
      .from('driver_financial_ledger')
      .select(`
        id, transaction_type, amount, occurred_at,
        driver_settlement_items ( settlement_id )
      `)
      .eq('driver_id', driverId)
      .gte('occurred_at', startUtc)
      .lt('occurred_at', endUtc)
      .in('transaction_type', ['delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment']);

    console.log('\n--- Ledger Rows ---');
    console.log(JSON.stringify(ledgers, null, 2));
    
    if (ledgers) {
      const unsettled = ledgers.filter(l => !l.driver_settlement_items || l.driver_settlement_items.length === 0);
      console.log(`\nUnsettled Rows: ${unsettled.length}`);
    }

    // Check Previous Unsettled
    const { data: oldLedgers } = await supabase
      .from('driver_financial_ledger')
      .select(`id, driver_settlement_items ( settlement_id )`)
      .eq('driver_id', driverId)
      .lt('occurred_at', startUtc);
    
    let hasOldUnsettled = false;
    if (oldLedgers) {
      const oldUnsettled = oldLedgers.filter(l => !l.driver_settlement_items || l.driver_settlement_items.length === 0);
      hasOldUnsettled = oldUnsettled.length > 0;
      console.log(`\nHas older unsettled ledgers: ${hasOldUnsettled}`);
    }

  } catch(e) {
    console.error(e);
  }
}
run();
