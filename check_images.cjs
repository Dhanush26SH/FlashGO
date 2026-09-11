const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkImages() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, image_url')
    .limit(5);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(data);
  }
}

checkImages();
