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
  console.log(`STATUS: ${po.status}`);
  
  const { data: items } = await supabase.from('procurement_order_items').select('*, products(name)').eq('procurement_order_id', po.id);
  
  if (items && items.length > 0) {
    const item = items[0];
    console.log('DB ORDERED QUANTITY:', item.quantity);
    console.log('DB RECEIVED QUANTITY:', item.received_quantity);
  }
}

test().catch(console.error);
