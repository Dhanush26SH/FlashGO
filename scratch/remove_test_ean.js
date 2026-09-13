import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: prodData } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%24 Mantra Organic Brown Rice%')
    .single();

  if (prodData) {
    const { error } = await supabase.rpc('admin_update_product', {
      p_id: prodData.id,
      p_price: prodData.price,
      p_discount_price: prodData.discount_price,
      p_sku: prodData.sku,
      p_barcode: prodData.barcode,
      p_image_url: prodData.image_url,
      p_is_active: prodData.is_active,
      p_category_id: prodData.category_id,
      p_name: prodData.name,
      p_description: prodData.description,
      p_manufacturer_barcode: null,
      p_manufacturer_barcode_verified: false
    });
    console.log(error ? 'Error:' + JSON.stringify(error) : 'Successfully removed test EAN.');
  }
}

main();
