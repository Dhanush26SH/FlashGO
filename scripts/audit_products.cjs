const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean).map(l => l.split('=')));
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  // Query 1: Schema definitions
  const { data: schema, error: schemaErr } = await supabase.rpc('query_logs', { sql: `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
    AND column_name IN ('sku', 'internal_barcode', 'internal_sku_barcode', 'manufacturer_barcode', 'barcode');
  ` });
  
  // If rpc query_logs doesn't exist, we will use direct REST to get count and data, and describe table using psql if possible. Wait, anon key can't run arbitrary SQL via RPC unless we have a specific RPC. Let's try it, but fall back to raw data query.
  
  console.log("== SCHEMA ==");
  if (schemaErr) console.error("Could not run schema query via RPC:", schemaErr);
  else console.log(schema);
  
  console.log("\n== DATA AUDIT ==");
  // Query 2: Data Audit
  const { count: totalRows } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log(`Total Rows: ${totalRows}`);
  
  const { count: internalBarcodeCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).not('internal_barcode', 'is', null);
  console.log(`Populated internal_barcode: ${internalBarcodeCount}`);
  
  const { count: internalSkuBarcodeCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).not('internal_sku_barcode', 'is', null);
  console.log(`Populated internal_sku_barcode: ${internalSkuBarcodeCount}`);
  
  const { data: mismatchData } = await supabase.from('products').select('internal_barcode, internal_sku_barcode').not('internal_sku_barcode', 'is', null).not('internal_barcode', 'is', null);
  const same = mismatchData ? mismatchData.filter(d => d.internal_barcode === d.internal_sku_barcode).length : 0;
  const different = mismatchData ? mismatchData.filter(d => d.internal_barcode !== d.internal_sku_barcode).length : 0;
  console.log(`Of rows with both, ${same} are identical and ${different} are different.`);
  
  console.log("\n== EXAMPLES ==");
  const { data: examples } = await supabase.from('products').select('id, sku, internal_barcode, internal_sku_barcode, manufacturer_barcode, barcode').limit(5);
  console.log(JSON.stringify(examples, null, 2));
}

run();
