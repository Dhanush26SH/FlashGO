import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // 1. Get the most recent fresh order that had issue (or the active picking order)
    const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(3);
    
    // find the one that the picker is assigned to (status picking or placed)
    const order = orders.find(o => o.status === 'picking' || o.picker_id != null) || orders[0];
    
    if (!order) {
        console.log("No orders found");
        return;
    }
    
    console.log("=== ORDER STATUS ===");
    console.log("ID:", order.id);
    console.log("Status:", order.status);
    console.log("Picker ID:", order.picker_id);
    console.log("Picker Assigned At:", order.picker_assigned_at);
    
    console.log("\n=== ORDER ITEMS ===");
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    console.log(items);
    
    console.log("\n=== RESERVATIONS ===");
    const { data: reservations } = await supabase.from('inventory_reservations').select('*').eq('order_id', order.id);
    console.log(reservations);
    
    console.log("\n=== WAREHOUSE STOCK ===");
    // Just for the products in this order
    const pIds = items.map(i => i.product_id);
    const { data: stock } = await supabase.from('warehouse_stock').select('*').in('product_id', pIds).eq('warehouse_id', order.warehouse_id);
    console.log(stock);
    
    console.log("\n=== PLACEMENT QUANTITIES ===");
    const { data: placements } = await supabase.from('warehouse_product_placements').select('*').in('product_id', pIds).eq('warehouse_id', order.warehouse_id);
    console.log(placements);
    
    console.log("\n=== STOCK LEDGER EVENTS ===");
    const { data: ledger } = await supabase.from('stock_ledgers').select('*').eq('order_id', order.id);
    console.log(ledger);
}
run();
