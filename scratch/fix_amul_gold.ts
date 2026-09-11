import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function fixMapping() {
  const { error } = await adminClient.from('vendor_products').insert({
    vendor_id: 'b0000000-0000-0000-0000-000000000002',
    product_id: '9701ec5a-3fa0-4503-8404-3e6ce538fdaa',
    minimum_order_quantity: 1,
    is_active: true
  });
  if (error) {
    console.error("Failed to insert mapping:", error);
  } else {
    console.log("Successfully restored Amul Gold mapping.");
  }
}

fixMapping().catch(console.error);
