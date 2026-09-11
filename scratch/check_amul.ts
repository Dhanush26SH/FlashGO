import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function checkRow(id: string) {
    console.log(`\n--- Checking ID: ${id} ---`);
    const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
    console.log(`Product: ${product?.name}, SKU: ${product?.sku}, Price: ${product?.price}, Created: ${product?.created_at}`);
    console.log(`Desc: ${product?.description}`);
    console.log(`Stock: ${product?.stock_quantity}`);

    const { data: orderItems } = await supabase.from('order_items').select('id').eq('product_id', id);
    console.log(`Order Items: ${orderItems?.length || 0}`);

    const { data: inventory } = await supabase.from('warehouse_stock').select('*').eq('product_id', id);
    console.log(`Warehouse Stock rows: ${inventory?.length || 0} (total qty: ${inventory?.reduce((a, b) => a + b.quantity, 0) || 0})`);

    const { data: batches } = await supabase.from('product_batches').select('*').eq('product_id', id);
    console.log(`Batches: ${batches?.length || 0} (total qty: ${batches?.reduce((a, b) => a + b.initial_quantity, 0) || 0})`);

    const { data: reservations } = await supabase.from('inventory_reservations').select('id').eq('product_id', id);
    console.log(`Reservations: ${reservations?.length || 0}`);
}

async function run() {
    await checkRow('888f7899-2f74-4d18-a2b5-dfce6c354287');
    await checkRow('9701ec5a-3fa0-4503-8404-3e6ce538fdaa');
}
run();
