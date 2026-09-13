import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .not('internal_sku_barcode', 'is', null);

  if (error) {
    console.error(error);
  } else {
    console.log(`Internal SKU barcodes assigned: ${count}`);
  }
}

main();
