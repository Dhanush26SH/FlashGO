import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: pos } = await supabase.from('procurement_orders').select('*').eq('total_cost', 125).order('created_at', { ascending: false }).limit(1);
  if (!pos || pos.length === 0) {
    console.log('No PO found with total 125');
    return;
  }
  
  const po = pos[0];
  console.log(`PO #${po.id.slice(-6).toUpperCase()} EXISTS: YES`);
  
  const { data: items } = await supabase.from('procurement_order_items').select('*, products(name)').eq('procurement_order_id', po.id);
  
  console.log('DB PO ITEM COUNT:', items?.length);
  if (items && items.length > 0) {
    const item = items[0];
    console.log('DB PRODUCT:', item.products.name);
    console.log('DB ORDERED QUANTITY:', item.quantity);
    console.log('DB RECEIVED QUANTITY:', item.received_quantity);
    console.log('DB UNIT COST:', item.cost_per_unit);
  } else {
    console.log('DB PRODUCT: N/A');
    console.log('DB ORDERED QUANTITY: N/A');
    console.log('DB RECEIVED QUANTITY: N/A');
    console.log('DB UNIT COST: N/A');
  }
}

test().catch(console.error);
