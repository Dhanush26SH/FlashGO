import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function main() {
  const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    Deno.exit(1);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  // 1. D0 Location counts
  const { data: locs, error: locsErr } = await supabaseClient.from('warehouse_locations').select('*');
  if (locsErr) { console.error("Locs err:", locsErr); return; }

  const total_locations = locs?.length || 0;
  const a01 = locs?.filter(l => l.zone === 'A01').length;
  const a02 = locs?.filter(l => l.zone === 'A02').length;
  const a03 = locs?.filter(l => l.zone === 'A03').length;
  const fv01 = locs?.filter(l => l.zone === 'FV01').length;
  const cr01 = locs?.filter(l => l.zone === 'CR01').length;
  const fr01 = locs?.filter(l => l.zone === 'FR01').length;

  // Duplicates
  const codes = locs?.map(l => l.location_code) || [];
  const barcodes = locs?.map(l => l.barcode) || [];
  const duplicateCodes = codes.filter((item, index) => codes.indexOf(item) !== index).length;
  const duplicateBarcodes = barcodes.filter((item, index) => barcodes.indexOf(item) !== index).length;

  // Examples
  const exampleA01 = locs?.find(l => l.zone === 'A01' && l.shelf_level === '01' && l.position === 'A')?.location_code;
  const exampleA02 = locs?.find(l => l.zone === 'A02')?.location_code;
  const exampleA03 = locs?.find(l => l.zone === 'A03')?.location_code;
  const exampleFV01 = locs?.find(l => l.zone === 'FV01')?.location_code;
  const exampleCR01 = locs?.find(l => l.zone === 'CR01')?.location_code;
  const exampleFR01 = locs?.find(l => l.zone === 'FR01')?.location_code;

  // 2. Real Placement Statistics
  const { data: stock } = await supabaseClient.from('warehouse_stock').select('*, product:products(name, barcode, category_id)');
  const { data: placements } = await supabaseClient.from('warehouse_product_placements').select('*, location:warehouse_locations(*)');
  const { data: events } = await supabaseClient.from('warehouse_placement_events').select('id');
  const { data: categories } = await supabaseClient.from('categories').select('*');

  const total_stock_qty = stock?.reduce((acc, curr) => acc + curr.quantity, 0) || 0;
  const total_placed_qty = placements?.reduce((acc, curr) => acc + curr.quantity, 0) || 0;
  const total_unplaced_qty = total_stock_qty - total_placed_qty;

  let capacity_violations = 0;
  const locMap = {};
  placements?.forEach(p => {
      locMap[p.location_id] = (locMap[p.location_id] || 0) + p.quantity;
  });
  for (const [locId, qty] of Object.entries(locMap)) {
      const loc = locs?.find(l => l.id === locId);
      if (loc && qty > loc.capacity) capacity_violations++;
  }

  // Zone rules
  let zone_violations = 0;
  placements?.forEach(p => {
      const cat = categories?.find(c => c.id === stock?.find(s => s.product_id === p.product_id)?.product?.category_id);
      if (cat && cat.storage_zone && cat.storage_zone !== p.location.zone && cat.storage_zone !== 'ambient') {
          if (!(cat.storage_zone === 'ambient' && p.location.zone.startsWith('A'))) {
             zone_violations++;
          }
      }
  });

  const report = {
    physical_layout: {
      total_locations,
      a01, a02, a03, fv01, cr01, fr01,
      duplicate_codes: duplicateCodes,
      duplicate_barcodes: duplicateBarcodes,
      examples: { A01: exampleA01, A02: exampleA02, A03: exampleA03, FV01: exampleFV01, CR01: exampleCR01, FR01: exampleFR01 }
    },
    placement_statistics: {
      total_stock_qty,
      total_placed_qty,
      total_unplaced_qty,
      capacity_violations,
      zone_violations,
      total_placement_rows: placements?.length || 0,
      total_events: events?.length || 0
    },
    category_mapping: categories?.map(c => ({ name: c.name, zone: c.storage_zone })),
    real_examples: placements?.slice(0, 5).map(p => ({
      product: stock?.find(s => s.product_id === p.product_id)?.product?.name,
      qty: p.quantity,
      location: p.location.location_code
    }))
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
