import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
    console.log('--- Database Enum for Duties ---');
  let enumData = null;
  try {
      const res = await adminClient.rpc('execute_sql', {
          sql: `
              SELECT t.typname, e.enumlabel
              FROM pg_type t
              JOIN pg_enum e ON t.oid = e.enumtypid
              WHERE t.typname LIKE '%duty%' OR t.typname LIKE '%staff%';
          `
      });
      enumData = res.data;
  } catch (e) {}

  if (enumData) {
      console.log('Enums:', enumData);
  } else {
      console.log('execute_sql not available, querying directly via REST or will check manually');
  }

  console.log('\n--- Checking staff_shifts columns ---');
  let shiftCols = null;
  try {
      const res = await adminClient.rpc('execute_sql', {
          sql: `
              SELECT column_name, data_type, udt_name
              FROM information_schema.columns
              WHERE table_name = 'staff_shifts';
          `
      });
      shiftCols = res.data;
  } catch (e) {}
  console.log('Columns:', shiftCols);

    console.log('\n--- Active Shifts Sample ---');
    const { data: shifts } = await adminClient
        .from('staff_shifts')
        .select('*')
        .limit(5);
    console.log('Shifts:', shifts);

    console.log('\n--- Expiry Batch Test ---');
    const { data: testBatches } = await adminClient
        .from('product_batches')
        .select('*')
        .in('batch_number', ['BAT-TEST-01', 'BAT-TEST-02']);
    console.log('Test Batches:', testBatches);

}

investigate().catch(console.error);
