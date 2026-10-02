import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const profileId = 'ca205131-f73f-4e5d-adc2-e92935b1eaa5'; // Ashish
  const locationId = '79412e39-3570-494e-9bb3-2345c35f9a24'; // D0-FV01-002-05-B
  const batchId = '2017cdde-848c-4603-ab5d-0aeeb934e205'; // FG-BATCH-20260930-599E

  const { data, error } = await adminClient.rpc('test_run_good', {
    p_user_id: profileId,
    p_location_id: locationId,
    p_batch_id: batchId
  });
  
  console.log('Test wrapper RPC result:', data, error);
}

run();
