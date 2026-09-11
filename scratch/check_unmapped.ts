import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function checkUnmapped() {
  const { data: allVp } = await adminClient.from('vendor_products').select('vendor_id, product_id, is_active, products(is_active)');
  const uniqueProducts = new Set(allVp.filter((vp: any) => vp.is_active).map((vp: any) => vp.product_id));
  const { data: allActiveProds } = await adminClient.from('products').select('id, name').eq('is_active', true);
  
  const unmapped = allActiveProds.filter(p => !uniqueProducts.has(p.id));
  console.log("Unmapped active products:", unmapped);
}

checkUnmapped().catch(console.error);
