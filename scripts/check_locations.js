import { createClient } from '@supabase/supabase-js';

const url = 'https://szpfuommfvrfdliloxcg.supabase.co';
const key = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(url, key);

async function check() {
  console.log("Checking warehouses...");
  const { data: wh, error: whErr } = await supabase.from('warehouses').select('*');
  console.log("Warehouses:", wh);

  console.log("\nChecking inventory_locations...");
  const { data: locs, error: locErr } = await supabase.from('inventory_locations').select('*');
  console.log(`inventory_locations count: ${locs?.length || 0}`);
  if (locs && locs.length > 0) {
    console.log("Sample:", locs.slice(0, 3));
  } else {
    console.log("Error or empty:", locErr);
  }
}

check();
