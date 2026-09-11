const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const prods = await supabase.from('products').select('id, sku, name, category_id, categories(name)');
  const cats = await supabase.from('categories').select('id, name');
  
  fs.writeFileSync('remote_products.json', JSON.stringify(prods.data, null, 2));
  fs.writeFileSync('remote_categories.json', JSON.stringify(cats.data, null, 2));
  console.log('Fetched', prods.data.length, 'products and', cats.data.length, 'categories.');
}

run();
