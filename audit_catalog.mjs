import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("Fetching a warehouse ID from warehouse_stock...");
        const { data: stockItem, error: wErr } = await supabase.from('warehouse_stock').select('warehouse_id').limit(1);
        if (wErr) throw wErr;
        
        let whId = null;
        if (stockItem && stockItem.length > 0) {
            whId = stockItem[0].warehouse_id;
            console.log("Warehouse ID:", whId);
        } else {
            console.log("No warehouse_stock found, using hardcoded F0 (guessed).");
            whId = 'w0000000-0000-0000-0000-000000000000'; // Just a fallback
        }
        
        const { data: allProds, error: pErr } = await supabase.from('products').select('*');
        if (pErr) throw pErr;
        console.log("Total DB products:", allProds.length);

        const { data: stocked, error: sErr } = await supabase.from('warehouse_stock').select('product_id').eq('warehouse_id', whId);
        if (sErr) throw sErr;
        console.log("Products in warehouse_stock table:", stocked.length);
        
        const { data: rpcProds, error: rErr } = await supabase.rpc('get_warehouse_catalog', { p_warehouse_id: whId, p_limit: 1000 });
        if (rErr) throw rErr;
        console.log("Customer eligible (via RPC):", rpcProds ? rpcProds.length : 0);
        
        const { data: positiveStock, error: psErr } = await supabase.from('warehouse_stock').select('product_id').eq('warehouse_id', whId).gt('quantity', 0);
        if (psErr) throw psErr;
        console.log("Positive warehouse_stock:", positiveStock.length);
        
        const { data: placements, error: plErr } = await supabase.from('warehouse_product_placements').select('product_id').eq('warehouse_id', whId).gt('quantity', 0);
        if (plErr) throw plErr;
        const uniquePlacements = new Set(placements.map(p => p.product_id));
        console.log("Unique products with >0 placement:", uniquePlacements.size);

    } catch (e) {
        console.error("Error:", e);
    }
}
run();
