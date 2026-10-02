import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function findExpiredBatches() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Checking for expired batches strictly before: ${today}`);

  // Need Udupi warehouse ID
  const { data: udupi, error: whErr } = await adminClient
    .from('warehouses')
    .select('id, name')
    .ilike('name', '%Udupi%')
    .single();

  if (whErr) throw whErr;
  console.log(`Udupi Warehouse ID: ${udupi.id}`);

  const { data: expiredBatches, error: batchErr } = await adminClient
    .from('product_batches')
    .select(`
      id,
      expiry_date,
      available_quantity,
      product_id,
      batch_number,
      products (
        name
      )
    `)
    .eq('warehouse_id', udupi.id)
    .eq('status', 'active')
    .lt('expiry_date', today)
    .gt('available_quantity', 0);

  if (batchErr) throw batchErr;

  console.log(`Found ${expiredBatches.length} eligible expired batches.`);
  for (const b of expiredBatches) {
    console.log(`- Batch: ${b.batch_number}, Product: ${b.products?.name}, Expiry: ${b.expiry_date}, Qty: ${b.available_quantity}`);
  }
}

findExpiredBatches().catch(console.error);
