import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: pos } = await supabase.from('procurement_orders').select('*').eq('total_cost', 125).order('created_at', { ascending: false }).limit(1);
  if (!pos || pos.length === 0) {
    console.log('PO not found');
    return;
  }
  const po = pos[0];
  console.log(`PO #${po.id.slice(-6).toUpperCase()} STATUS:`, po.status);
  
  const { data: items } = await supabase.from('procurement_order_items').select('*').eq('procurement_order_id', po.id);
  console.log('PO RECEIVED QUANTITY:', items && items.length > 0 ? items[0].received_quantity : 'N/A');
  
  const { data: grns } = await supabase.from('goods_receipts').select('*').eq('procurement_order_id', po.id);
  console.log('GRN COUNT:', grns?.length);
  if (grns && grns.length > 0) {
    console.log('FAILED HUMAN GRN CREATED: YES');
  } else {
    console.log('FAILED HUMAN GRN CREATED: NO');
  }
  
  const { data: stock } = await supabase.from('warehouse_stock').select('*').eq('warehouse_id', po.warehouse_id).eq('product_id', items[0].product_id);
  console.log('AMUL INVENTORY FOR PO WAREHOUSE:', stock && stock.length > 0 ? stock[0].quantity : 0);
}

check().catch(console.error);
