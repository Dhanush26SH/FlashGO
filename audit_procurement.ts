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

  const { data: wh } = await supabase.from('warehouses').select('id, name').ilike('name', '%udupi%').single();

  const { data: vps, error: vpsError } = await supabase
    .from('vendor_products')
    .select(`
      *,
      products (
        id, name, sku, barcode, internal_barcode, is_active
      ),
      vendors (
        id, name
      )
    `)
    .limit(300);

  if (vpsError) {
    console.error('Error fetching mappings:', vpsError);
    return;
  }

  if (!vps) {
    console.log('No mappings found or error');
    return;
  }

  for (const vp of vps) {
    const p = vp.products;
    const v = vp.vendors;
    
    if (vp.is_active && vp.purchase_price > 0 && vp.minimum_order_quantity > 0 && p && p.is_active && v) {
        
        // Regex check for FLH barcode
        const hasValidFLH = p.internal_barcode && /^FLH[0-9]{6}$/.test(p.internal_barcode);
        
        if (!hasValidFLH) continue;
        
        let stockAvailable = 0;
        let stockStaging = 0;
        
        if (wh) {
            const { data: stock } = await supabase
              .from('warehouse_stock')
              .select('quantity, staging_quantity')
              .eq('product_id', p.id)
              .eq('warehouse_id', wh.id)
              .single();
            if (stock) {
                stockAvailable = stock.quantity;
                stockStaging = stock.staging_quantity;
            }
        }
        
        const { data: openPOs } = await supabase
          .from('purchase_order_items')
          .select('id, purchase_orders(id, status)')
          .eq('product_id', p.id);
          
        let openPOCount = 0;
        if (openPOs) {
            openPOCount = openPOs.filter(poi => {
                const s = poi.purchase_orders?.status;
                return s === 'DRAFT' || s === 'SENT' || s === 'PARTIAL_RECEIPT';
            }).length;
        }
        
        const { data: tasks } = await supabase
          .from('warehouse_tasks')
          .select('id')
          .eq('product_id', p.id)
          .in('status', ['PENDING', 'ASSIGNED', 'IN_PROGRESS']);
          
        console.log(`\nCandidate: ${p.name}`);
        console.log(`- SKU: ${p.sku}`);
        console.log(`- Internal FLH barcode: ${p.internal_barcode}`);
        console.log(`- Vendor: ${v.name}`);
        console.log(`- Purchase Price: ₹${vp.purchase_price}`);
        console.log(`- MOQ: ${vp.minimum_order_quantity}`);
        console.log(`- Stock (Udupi): Available=${stockAvailable}, Staging=${stockStaging}`);
        console.log(`- Open POs: ${openPOCount}`);
        console.log(`- Open Tasks: ${tasks?.length || 0}`);
        
        if (openPOCount === 0 && (!tasks || tasks.length === 0)) {
            console.log('\n>>> SELECTED FOR TEST <<<');
            break;
        }
    }
  }
}

run();
