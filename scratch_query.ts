import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'test_admin_1788638678169@example.com',
    password: 'Password123!'
  });

  const { data: products } = await supabase.from('products').select('*').ilike('name', '%Nandini%');
  if (!products || products.length === 0) {
    console.log("Product not found");
    return;
  }
  
  for (const product of products) {
    console.log(`\nPRODUCT: ${product.name} (${product.id}) [SKU: ${product.sku}]`);
    const { data: vendorProducts, error } = await supabase.from('vendor_products').select('*').eq('product_id', product.id);
    if (error) console.log("ERROR:", error);
    else console.log("VENDOR PRODUCTS:", vendorProducts);
  }
}

run();
