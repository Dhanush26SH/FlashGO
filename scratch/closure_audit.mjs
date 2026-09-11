import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing env vars!");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runAudit() {
  const orderId = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';
  
  const { data: order } = await adminClient.from('orders').select('*').eq('id', orderId).single();
  console.log("ORDER STATUS:", order.status);
  console.log("TOTAL:", order.total_amount);
  console.log("PAYMENT:", order.payment_method);
  console.log("COD_COLLECTED:", order.cod_collected);
  console.log("TRIP_ID:", order.trip_id);
  
  if (order.trip_id) {
     const { data: trip } = await adminClient.from('logistics_trips').select('*').eq('id', order.trip_id).single();
     console.log("TRIP STATUS:", trip.status);
  }
  
  const { data: earnings, error: eErr } = await adminClient.from('driver_earnings').select('*').eq('order_id', orderId);
  console.log("EARNINGS COUNT:", earnings?.length);
  
  const { data: stock } = await adminClient.from('warehouse_stock').select('*').eq('product_id', 'a8c962dc-549b-4395-8422-9907c0800b7d');
  console.log("STOCK:", stock);
  
  const { data: res } = await adminClient.from('inventory_reservations').select('*').eq('order_id', orderId);
  console.log("RESERVATIONS:", res);
  
  const { data: po } = await adminClient.from('purchase_orders').select('*').eq('po_number', '179CFB').single();
  console.log("PO:", po);
  if (po) {
     const { data: grn } = await adminClient.from('grn_documents').select('*').eq('purchase_order_id', po.id);
     console.log("GRN COUNT:", grn?.length);
  }
}
runAudit();
