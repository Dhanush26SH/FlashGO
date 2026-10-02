import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const profileId = 'ca205131-f73f-4e5d-adc2-e92935b1eaa5';
  const warehouseId = '19875f28-e4b8-46ec-a801-ff264cda83ff'; // Udupi
  const locationId = '79412e39-3570-494e-9bb3-2345c35f9a24';
  const batchId = '2017cdde-848c-4603-ab5d-0aeeb934e205';
  const productId = '275f1a51-5182-45e0-82cc-37dd57ebba75'; // Derived from other queries usually

  console.log('--- Direct Table Insert ---');
  // First, get the product id from batch
  const { data: batch } = await adminClient.from('product_batches').select('product_id').eq('id', batchId).single();

  const { data, error } = await adminClient.from('fnv_inspections').insert({
    warehouse_id: warehouseId,
    product_id: batch?.product_id,
    batch_id: batchId,
    location_id: locationId,
    staff_id: profileId,
    result: 'good'
  }).select('*');
  
  console.log('Insert result:', data, error);
}

run();
