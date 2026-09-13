import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { supabaseUrl, hasKey: !!supabaseKey });
    // Deno fallback - sometimes Node reads different env
  }

  // We can't query if we don't have the service key, but we'll try with ANON key if service key is missing
  const keyToUse = supabaseKey || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseClient = createClient(supabaseUrl, keyToUse);

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

  const codes = locs?.map(l => l.location_code) || [];
  const duplicateCodes = codes.filter((item, index) => codes.indexOf(item) !== index).length;

  const { data: stock } = await supabaseClient.from('warehouse_stock').select('*, product:products(name, barcode, category_id)');
  const { data: placements } = await supabaseClient.from('warehouse_product_placements').select('*, location:warehouse_locations(*)');
  const { data: events } = await supabaseClient.from('warehouse_placement_events').select('id');
  
  const report = {
    total_locations,
    a01, a02, a03, fv01, cr01, fr01,
    duplicateCodes,
    total_stock_qty: stock?.reduce((a,c) => a + c.quantity, 0),
    total_placed_qty: placements?.reduce((a,c) => a + c.quantity, 0),
    total_events: events?.length
  };
  console.log(JSON.stringify(report, null, 2));
}
main();
