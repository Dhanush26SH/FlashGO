const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(supabaseUrl, supabaseKey);

const newImages = {
  'SKU-FR-BAN': 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=300&q=80',
  'SKU-FR-APL': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6fac6?w=300&q=80',
  'SKU-VG-TOM': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300&q=80',
  'SKU-VG-CUC': 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=300&q=80',
  'SKU-DY-MILK': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&q=80',
  'SKU-DY-BTR': 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300&q=80',
  'SKU-BD-SOUR': 'https://images.unsplash.com/photo-1589367920969-ab8e050eb0e9?w=300&q=80',
  'SKU-DY-EGGS': 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=300&q=80',
  'SKU-SN-CHIP': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=300&q=80',
  'SKU-SN-COOK': 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=300&q=80',
  'SKU-SN-ALM': 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=300&q=80',
  'SKU-DR-SPRK': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&q=80',
  'SKU-DR-ORNG': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=300&q=80',
  'SKU-HH-DISH': 'https://images.unsplash.com/photo-1585553616435-2dc0a54e271d?w=300&q=80',
  'SKU-HH-TISS': 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=300&q=80'
};

async function updateImages() {
  console.log('Starting image updates...');
  for (const [sku, url] of Object.entries(newImages)) {
    const { error } = await supabase
      .from('products')
      .update({ image_url: url })
      .eq('sku', sku);
    
    if (error) {
      console.error(`Error updating ${sku}:`, error.message);
    } else {
      console.log(`Updated ${sku} successfully`);
    }
  }
  console.log('Done!');
}

updateImages();
