import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const t1 = await adminClient.from('warehouse_product_placements').select('*').limit(1);
  console.log('warehouse_product_placements:', Object.keys(t1.data?.[0] || {}));
  
  const t2 = await adminClient.from('warehouse_stock').select('*').limit(1);
  console.log('warehouse_stock:', Object.keys(t2.data?.[0] || {}));
}

run();
