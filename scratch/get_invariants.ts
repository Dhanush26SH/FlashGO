import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function getInvariants() {
  const counts: Record<string, any> = {};

  const { count: vendors } = await supabase.from('vendors').select('*', { count: 'exact', head: true });
  counts['vendors'] = vendors;

  const { error: vpErr, count: vp } = await supabase.from('vendor_products').select('*', { count: 'exact', head: true });
  counts['vendor_products'] = vpErr ? 'table not found' : vp;

  const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true });
  counts['totalProducts'] = totalProducts;

  const { count: activeProducts } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
  counts['activeProducts'] = activeProducts;

  const { data: stockData } = await supabase.from('warehouse_stock').select('quantity');
  counts['warehouse_stock_rows'] = stockData?.length || 0;
  counts['warehouse_stock_sum'] = stockData?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

  const { data: batchesData } = await supabase.from('product_batches').select('*');
  counts['product_batches_rows'] = batchesData?.length || 0;
  counts['product_batches_sum'] = batchesData?.reduce((sum, r) => sum + (r.quantity !== undefined ? r.quantity : (r.stock_quantity || 0)), 0) || 0;

  const { count: ledgers } = await supabase.from('stock_ledgers').select('*', { count: 'exact', head: true });
  counts['stock_ledgers'] = ledgers;

  const { count: pos } = await supabase.from('procurement_orders').select('*', { count: 'exact', head: true });
  counts['procurement_orders'] = pos;

  const { count: grns } = await supabase.from('goods_receipts').select('*', { count: 'exact', head: true });
  counts['goods_receipts'] = grns;

  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\scratch\\invariants_post.json', JSON.stringify(counts, null, 2));
  console.log(counts);
}

getInvariants().catch(console.error);
