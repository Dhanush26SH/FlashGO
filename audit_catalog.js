import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // Audit 2 & 3: What does the database return for warehouse F0?
    // Get F0 warehouse
    const { data: warehouse } = await supabase.from('warehouses').select('*').limit(1);
    if (!warehouse || warehouse.length === 0) return;
    const whId = warehouse[0].id;
    
    console.log("Warehouse ID:", whId);
    
    // Total catalog products
    const { count: totalProds } = await supabase.from('products').select('*', { count: 'exact', head: true });
    console.log("Total DB products:", totalProds);

    // Products stocked at this warehouse
    const { data: stocked } = await supabase.from('warehouse_stock').select('product_id').eq('warehouse_id', whId);
    console.log("Products in warehouse_stock table:", stocked.length);
    
    // Products customer-eligible (active + stocked at warehouse)
    // The RPC does JOIN public.warehouse_stock ws ON ws.product_id = p.id WHERE ws.warehouse_id = p_warehouse_id AND p.is_active = true
    const { data: rpcProds } = await supabase.rpc('get_warehouse_catalog', { p_warehouse_id: whId, p_limit: 1000 });
    console.log("Customer eligible (via RPC):", rpcProds ? rpcProds.length : 0);
    
    // Products with positive available stock
    const { data: positiveStock } = await supabase.from('warehouse_stock').select('product_id').eq('warehouse_id', whId).gt('quantity', 0);
    console.log("Positive warehouse_stock:", positiveStock.length);
    
    // Products with valid placement
    const { data: placements } = await supabase.from('warehouse_product_placements').select('product_id').eq('warehouse_id', whId).gt('quantity', 0);
    const uniquePlacements = new Set(placements.map(p => p.product_id));
    console.log("Unique products with >0 placement:", uniquePlacements.size);
    
    // Let's identify the missing 14 products in DB compared to UI.
    // In UI, 237 products. In DB, 223.
    // Wait, earlier I found 17 mock products by regex in db.ts, maybe more.
}
run();
