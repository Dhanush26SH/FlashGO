import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

// Known warehouse IDs from migrations
const WAREHOUSES = [
  { id: '9f4d3149-f3e4-432b-98b6-f17af77c9c33', name: 'Udupi FlashGO Store' },
];

async function run() {
  try {
    // Confirm total products
    const { data: products } = await supabase.from('products').select('id, name, internal_barcode, is_active').order('name');
    console.log(`Total authoritative products in DB: ${products.length}`);
    console.log(`Active: ${products.filter(p => p.is_active).length} | Inactive: ${products.filter(p => !p.is_active).length}`);
    console.log(`With internal_barcode: ${products.filter(p => p.internal_barcode).length} | Without: ${products.filter(p => !p.internal_barcode).length}`);

    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    for (const wh of WAREHOUSES) {
      console.log(`\n=== ${wh.name} (${wh.id}) ===`);

      // get_warehouse_catalog is SECURITY DEFINER — anon key can call it
      const { data: catalogRows, error: catErr } = await supabase.rpc('get_warehouse_catalog', {
        p_warehouse_id: wh.id,
        p_limit: 1000
      });

      if (catErr) {
        console.error('  get_warehouse_catalog error:', catErr.message);
        continue;
      }

      console.log(`  Customer-eligible (get_warehouse_catalog): ${catalogRows.length}`);

      // Verify internal_barcode on each catalog product
      const missingBarcode = catalogRows.filter(row => {
        const id = row.id || row.product_id;
        return !productMap[id]?.internal_barcode;
      });
      console.log(`  Products missing internal_barcode: ${missingBarcode.length}`);
      if (missingBarcode.length > 0) missingBarcode.forEach(p => console.log(`    MISSING: ${p.name}`));

      // Check warehouse_product_placements — anon RLS likely blocks this
      const { data: placements, error: plErr } = await supabase
        .from('warehouse_product_placements')
        .select('product_id, quantity')
        .eq('warehouse_id', wh.id)
        .gt('quantity', 0);

      if (plErr) {
        console.log(`  warehouse_product_placements: RLS blocked anon access (${plErr.message})`);
        console.log(`  Cannot determine pickability without authenticated session.`);
        console.log(`  NOTE: You must verify picker placements as admin/warehouse_staff.`);
      } else {
        const placedSet = new Set(placements.map(p => p.product_id));
        console.log(`  Products with active placements: ${placedSet.size}`);

        const notPickable = catalogRows.filter(row => {
          const id = row.id || row.product_id;
          return !placedSet.has(id);
        });
        console.log(`  Customer-visible but NOT pickable (no active placement): ${notPickable.length}`);
        if (notPickable.length > 0) {
          notPickable.forEach(p => console.log(`    NOT PICKABLE: [${p.id || p.product_id}] ${p.name}`));
        }
      }
    }

    console.log('\n=== ADMIN FIX VERIFICATION ===');
    console.log(`DB product count (authoritative): ${products.length}`);
    console.log('After Admin reload: Catalog Registry must show', products.length, 'products');
    console.log('After Admin reload: Baby Care filter must show 7 products');
    
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
