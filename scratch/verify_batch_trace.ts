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
  console.log(`\nPO: #179CFB (UUID: ${po.id})`);
  console.log(`warehouse_id: ${po.warehouse_id}`);
  
  const { data: items } = await supabase.from('procurement_order_items').select('*').eq('procurement_order_id', po.id);
  const poItem = items![0];
  console.log(`procurement_order_item ID: ${poItem.id}`);
  console.log(`ordered_quantity: ${poItem.quantity}`);
  console.log(`received_quantity: ${poItem.received_quantity}`);
  console.log(`PO STATUS: ${po.status}`);
  
  const { data: grns } = await supabase.from('goods_receipts').select('*').eq('procurement_order_id', po.id).eq('receipt_number', 'GRN-264060');
  if (grns && grns.length > 0) {
    console.log(`\nGRN-264060: EXISTS`);
    console.log(`goods_receipts row ID: ${grns[0].id}`);
    const { data: grnItems } = await supabase.from('goods_receipt_items').select('*').eq('goods_receipt_id', grns[0].id);
    const grnItem = grnItems![0];
    console.log(`goods_receipt_items row ID: ${grnItem.id}`);
    console.log(`accepted_quantity: ${grnItem.accepted_quantity}`);
    console.log(`rejected_quantity: ${grnItem.rejected_quantity}`);
    console.log(`unit_cost: ${grnItem.unit_cost}`);
    
    const { data: batches } = await supabase.from('product_batches').select('*').eq('batch_number', 'AMUL-TEST-001');
    if (batches && batches.length > 0) {
      console.log(`\nAMUL-TEST-001: EXISTS`);
      const b = batches[0];
      console.log(`product_batch ID: ${b.id}`);
      console.log(`product_id: ${b.product_id}`);
      console.log(`warehouse_id: ${b.warehouse_id}`);
      console.log(`quantity: ${b.quantity}`);
      console.log(`expiry_date: ${b.expiry_date}`);
      console.log(`goods_receipt_item_id: ${b.goods_receipt_item_id}`);
      console.log(`BATCH -> GRN LINK: ${b.goods_receipt_item_id === grnItem.id ? 'PASS' : 'FAIL'}`);
    } else {
      console.log(`\nAMUL-TEST-001: NOT FOUND`);
    }
  } else {
    console.log(`\nGRN-264060: NOT FOUND`);
  }
}

check().catch(console.error);
