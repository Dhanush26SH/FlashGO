import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('products')
    .select('name, manufacturer_barcode, manufacturer_barcode_verified')
    .ilike('name', '%24 Mantra Organic Brown Rice%');

  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

main();
