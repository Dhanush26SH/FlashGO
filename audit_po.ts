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

  // Fetch all recent POs to inspect them
  const { data: pos } = await supabase
    .from('procurement_orders')
    .select(`
      id,
      po_number,
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
    .limit(10);

  if (!pos || pos.length === 0) {
    console.log('No POs found');
    return;
  }

  for (const po of pos) {
    // Check if 529E05 is in id or po_number
    const idStr = po.id.toUpperCase();
    const poNumStr = (po.po_number || '').toUpperCase();
    
    if (idStr.includes('529E05') || poNumStr.includes('529E05') || po.po_number === 'PO-529E05' || po.total_cost === 280) {
        console.log('\n--- FOUND PO ---');
        console.log('ID:', po.id);
        console.log('PO Number:', po.po_number);
        console.log('Status:', po.status);
        console.log('Total Cost:', po.total_cost);
        console.log('Vendor:', po.vendors?.name);
        console.log('Warehouse:', po.warehouses?.name);
        console.log('Items:');
        for (const item of po.procurement_order_items) {
            console.log(`  - ${item.products?.name} (Qty: ${item.quantity}, Received: ${item.received_quantity})`);
        }
        
        // check dispatch
        const { data: dispatches } = await supabase
          .from('supplier_dispatch_batches')
          .select('*')
          .eq('procurement_order_id', po.id);
        console.log('Dispatches:', dispatches);
    }
  }
}

run();
