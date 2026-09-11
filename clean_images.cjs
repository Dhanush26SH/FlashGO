const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

const safeMappings = {
  "Fresh Hass Avocados": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=300&auto=format&fit=crop&q=80",
  "Baked Pita Chips": "https://images.unsplash.com/photo-1599490659213-e2b9527bb087?w=300&auto=format&fit=crop&q=80",
  "Banana Robusta": "https://images.unsplash.com/photo-1571501679680-de32f1e7aad4?w=300&auto=format&fit=crop&q=80",
  "Apple Royal Gala": "https://images.unsplash.com/photo-1560806887-1e4cd0b6fc6c?w=300&auto=format&fit=crop&q=80",
  "Tomato Hybrid": "https://images.unsplash.com/photo-1518977622874-5f4b5dd1704e?w=300&auto=format&fit=crop&q=80"
};

async function run() {
  const { data: products } = await supabase.from('products').select('id, name, image_url');
  
  let nullCount = 0;
  let updatedCount = 0;
  let brokenWiped = 0;

  for (const p of products) {
    const expected = safeMappings[p.name] || null;
    if (p.image_url !== expected) {
      if (p.image_url && !expected) brokenWiped++;
      await supabase.from('products').update({ image_url: expected }).eq('id', p.id);
      updatedCount++;
    }
    if (!expected) nullCount++;
  }
  
  console.log('UPDATED:', updatedCount);
  console.log('BROKEN WIPED:', brokenWiped);
  console.log('PRODUCTS USING FALLBACK:', nullCount);
  console.log('VALID MAPPED:', Object.keys(safeMappings).length);
}

run();
