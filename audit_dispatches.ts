import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  const { data: po } = await supabase
    .from('procurement_orders')
    .select(`
      id,
      status,
      total_cost,
      vendors (name),
      warehouses (name),
      procurement_order_items (
        id,
        quantity,
        received_quantity,
        cost_per_unit,
        products (name, sku)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (po && po.length > 0) {
    const thePo = po.find(p => p.id.toUpperCase().endsWith('529E05'));
    if (thePo) {
      console.log('Found PO ID:', thePo.id);
      console.log('PO Data:', JSON.stringify(thePo, null, 2));
      const { data: dispatches } = await supabase
        .from('supplier_dispatch_batches')
        .select('*')
        .eq('procurement_order_id', thePo.id);
      console.log('Existing Dispatches:', dispatches);
      return;
    }
  }
  
  console.log('PO not found anywhere');

  if (!po) {
    console.log('PO not found');
    return;
  }

  const { data: dispatches } = await supabase
    .from('supplier_dispatch_batches')
    .select('*')
    .eq('procurement_order_id', po.id);

  console.log('PO Found:', po.id);
  console.log('Existing Dispatches:', dispatches);
}

run();
