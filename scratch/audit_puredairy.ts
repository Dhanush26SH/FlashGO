import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const adminClient = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  const result: any = {};
  
  // 1. Query both PureDairy vendor records
  const { data: vendors } = await adminClient.from('vendors').select('*').ilike('name', '%PureDairy%');
  result.vendors = vendors;
  
  // 2. Identify which vendor ID is referenced by PO #179CFB
  const { data: po179 } = await adminClient.from('procurement_orders').select('vendor_id').eq('id', '53ea865d-2b8f-44d0-a2b6-e249b4179cfb').single();
  result.po_179cfb_vendor_id = po179?.vendor_id;
  
  // 3. For EACH PureDairy record return counts
  result.vendor_details = {};
  if (vendors) {
    for (const v of vendors) {
      const { count: vpCount } = await adminClient.from('vendor_products').select('*', { count: 'exact', head: true }).eq('vendor_id', v.id);
      const { data: vpList } = await adminClient.from('vendor_products').select('product_id, products(name, sku)').eq('vendor_id', v.id);
      const { count: poCount } = await adminClient.from('procurement_orders').select('*', { count: 'exact', head: true }).eq('vendor_id', v.id);
      
      result.vendor_details[v.id] = {
        name: v.name,
        vendor_products_count: vpCount,
        procurement_orders_count: poCount,
        mapped_products: vpList?.map(vp => ({
          product_id: vp.product_id,
          name: (vp.products as any)?.name,
          sku: (vp.products as any)?.sku
        }))
      };
    }
  }

  // Check invariants pre
  const { count: cWh1 } = await adminClient.from('warehouse_stock').select('*', { count: 'exact', head: true });
  const { count: cBatches1 } = await adminClient.from('product_batches').select('*', { count: 'exact', head: true });
  const { count: cLedgers1 } = await adminClient.from('stock_ledgers').select('*', { count: 'exact', head: true });
  
  result.invariants_pre = { warehouse_stock: cWh1, product_batches: cBatches1, stock_ledgers: cLedgers1 };

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\audit_puredairy.json', JSON.stringify(result, null, 2));
}

runAudit().catch(console.error);
