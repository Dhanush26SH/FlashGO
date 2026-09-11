import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: pos } = await supabase.from('procurement_orders').select('*').eq('id', '53ea865d-2b8f-44d0-a2b6-e249b4179cfb').limit(1);
  const po = pos![0];
  
  const { data: grns } = await supabase.from('goods_receipts').select('*').eq('procurement_order_id', po.id);
  if (grns && grns.length > 0) {
    for (const grn of grns) {
      console.log(`\nGRN FOUND: ${grn.receipt_number}`);
      console.log(`goods_receipts row ID: ${grn.id}`);
      
      const { data: grnItems, error } = await supabase.from('goods_receipt_items').select('*').eq('receipt_id', grn.id);
      if (error) console.log('ERROR:', error);
      if (!grnItems || grnItems.length === 0) continue;
      
      const grnItem = grnItems[0];
      console.log(`goods_receipt_items row ID: ${grnItem.id}`);
      console.log(`accepted_quantity: ${grnItem.accepted_quantity}`);
      console.log(`rejected_quantity: ${grnItem.rejected_quantity}`);
      console.log(`unit_cost: ${grnItem.unit_cost}`);
      
      const { data: batches } = await supabase.from('product_batches').select('*').eq('goods_receipt_item_id', grnItem.id);
      if (batches && batches.length > 0) {
        const b = batches[0];
        console.log(`\nBATCH FOUND: ${b.batch_number}`);
        console.log(`product_batch ID: ${b.id}`);
        console.log(`product_id: ${b.product_id}`);
        console.log(`warehouse_id: ${b.warehouse_id}`);
        console.log(`quantity: ${b.quantity}`);
        console.log(`expiry_date: ${b.expiry_date}`);
        console.log(`goods_receipt_item_id: ${b.goods_receipt_item_id}`);
        console.log(`BATCH -> GRN LINK: PASS`);
        
        const { data: stock } = await supabase.from('warehouse_stock').select('*').eq('warehouse_id', b.warehouse_id).eq('product_id', b.product_id);
        console.log(`warehouse_stock increment: ${stock![0].quantity}`);
        
        const { data: ledgers } = await supabase.from('stock_ledgers').select('*').eq('batch_id', b.id).order('created_at', { ascending: false }).limit(1);
        console.log(`stock_ledgers entry: ${ledgers![0].transaction_type} ${ledgers![0].quantity_change}`);
      } else {
        console.log(`\nNO BATCH FOUND FOR GRN ITEM`);
      }
    }
  } else {
    console.log(`\nNO GRNS FOUND FOR PO`);
  }
}

check().catch(console.error);
