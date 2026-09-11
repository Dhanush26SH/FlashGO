import { createClient } from '@supabase/supabase-js';

const ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const URL = 'https://szpfuommfvrfdliloxcg.supabase.co';

const adminClient = createClient(URL, SERVICE_KEY);

async function run() {
  const testOrderId = '5c48c3ff-d535-4556-b159-bf1b5ff6e01a';
  
  const { data: order, error } = await adminClient.from('orders')
    .select('*, profiles!orders_customer_id_fkey(full_name), warehouses(name), order_items(*, products(name))')
    .eq('id', testOrderId).single();
    
  if (error) {
    console.error("Order fetch error:", error);
    return;
  }
  
  const { data: reservations } = await adminClient.from('inventory_reservations')
    .select('*').eq('order_id', testOrderId);

  console.log("=== TEST ORDER REPORT ===");
  console.log(`Order UUID: ${order.id}`);
  console.log(`Short Number: ${order.id.split('-')[0]}`);
  console.log(`Customer: ${order.profiles?.full_name} (${order.customer_id})`);
  console.log(`Warehouse: ${order.warehouses?.name} (${order.warehouse_id})`);
  console.log(`Current Status: ${order.status}`);
  console.log(`Payment Method: ${order.payment_method}`);
  console.log(`Total: ₹${order.total_amount}`);
  
  console.log("\n--- ORDER ITEMS ---");
  order.order_items.forEach(item => {
    console.log(`- ${item.products?.name} (ID: ${item.product_id}) x ${item.quantity} [Status: ${item.status}]`);
  });
  
  console.log("\n--- RESERVATIONS ---");
  if (reservations && reservations.length > 0) {
    reservations.forEach(r => {
      console.log(`- Product: ${r.product_id}, Qty: ${r.quantity}, Status: ${r.status}`);
    });
  } else {
    console.log("No reservations found.");
  }
}

run();
