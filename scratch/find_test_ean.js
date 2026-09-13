import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .or('barcode.eq.8901234567890,manufacturer_barcode.eq.8901234567890,internal_sku_barcode.eq.8901234567890');

  if (error) {
    console.error(error);
  } else {
    console.log("Products with 8901234567890:", data);
  }
}

main();
