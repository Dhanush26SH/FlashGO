import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const profileId = 'ca205131-f73f-4e5d-adc2-e92935b1eaa5'; // Ashish
  
  const { data: profile } = await adminClient.from('profiles').select('*').eq('id', profileId).single();
  
  const { data: locations } = await adminClient.from('warehouse_locations')
    .select('*')
    .eq('location_code', 'D0-FV01-002-05-B')
    .eq('warehouse_id', profile.warehouse_id);
  const location = locations?.[0];

  const { data: batches } = await adminClient.from('product_batches')
    .select('*')
    .eq('batch_number', 'FG-BATCH-20260930-599E')
    .eq('warehouse_id', profile.warehouse_id);
  const batch = batches?.[0];

  if (batch && location) {
    const { data: placements, error } = await adminClient.from('warehouse_product_placements')
      .select('*')
      .eq('product_id', batch.product_id)
      .eq('location_id', location.id);
    console.log('Placements for product_id/location_id:', placements, error);
  }
}

run();
