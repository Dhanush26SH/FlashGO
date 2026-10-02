import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await adminClient.rpc('record_fnv_inspection_good', {
    p_location_id: '79412e39-3570-494e-9bb3-2345c35f9a24', // D0-FV01-002-05-B
    p_batch_id: '2017cdde-848c-4603-ab5d-0aeeb934e205' // FG-BATCH-20260930-599E
  });
  console.log('RPC result:', data, error);
}

run();
