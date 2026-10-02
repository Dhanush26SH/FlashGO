import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await adminClient.from('profiles').select('is_retired, role, is_pending_staff');
  if (error) {
    console.error(error);
    return;
  }
  
  let active = 0;
  let retired = 0;
  
  for (const p of data) {
    if (p.role === 'customer') continue;
    if (p.is_pending_staff) continue;
    
    if (p.is_retired) {
      retired++;
    } else {
      active++;
    }
  }
  
  console.log(`Active Staff: ${active}`);
  console.log(`Retired Staff: ${retired}`);
}

run();
