import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: totalProducts } = await supabase.from('products').select('id', { count: 'exact' });
    const { data: withBarcode } = await supabase.from('products').select('id').not('internal_barcode', 'is', null);
    const { data: nullBarcode } = await supabase.from('products').select('id').is('internal_barcode', null);
    
    const { data: allBarcodes } = await supabase.from('products').select('id, name, internal_barcode').not('internal_barcode', 'is', null);
    
    let duplicates = 0;
    const seen = new Set();
    let invalid = 0;
    let minStr = 'FLH999999';
    let maxStr = 'FLH000000';
    
    for (const p of allBarcodes || []) {
        if (seen.has(p.internal_barcode)) duplicates++;
        seen.add(p.internal_barcode);
        
        if (!/^FLH[0-9]{6}$/.test(p.internal_barcode)) invalid++;
        
        if (p.internal_barcode < minStr) minStr = p.internal_barcode;
        if (p.internal_barcode > maxStr) maxStr = p.internal_barcode;
    }
    
    console.log("total products:", totalProducts?.length || (allBarcodes?.length || 0) + (nullBarcode?.length || 0));
    console.log("products with internal_barcode:", withBarcode?.length || allBarcodes?.length || 0);
    console.log("NULL barcode count:", nullBarcode?.length || 0);
    console.log("duplicate barcode count:", duplicates);
    console.log("invalid-format count:", invalid);
    console.log("minimum generated barcode:", minStr);
    console.log("maximum generated barcode:", maxStr);
    console.log("sample 5 product -> barcode mappings:");
    for (let i=0; i<Math.min(5, allBarcodes?.length || 0); i++) {
        console.log(`- ${allBarcodes[i].name} -> ${allBarcodes[i].internal_barcode}`);
    }
}
run();
