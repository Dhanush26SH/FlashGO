import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: categories } = await supabase.from('categories').select('*');
  const { data: products } = await supabase.from('products').select('*, categories(name)').eq('is_active', true);
  
  let real = 0;
  let missing = 0;
  
  const catStats = {};
  for (const cat of categories) {
    catStats[cat.name] = { total: 0, real: 0, missing: 0, missingNames: [] };
  }
  
  for (const p of products) {
    const catName = p.categories.name;
    catStats[catName].total++;
    if (p.image_url && p.image_url.startsWith('http')) {
      real++;
      catStats[catName].real++;
    } else {
      missing++;
      catStats[catName].missing++;
      catStats[catName].missingNames.push(p.name);
    }
  }
  
  let nextCat = null;
  for (const catName of Object.keys(catStats).sort()) {
    const stat = catStats[catName];
    if (stat.total > 0 && stat.missing > 0 && !nextCat) {
      nextCat = catName;
    }
  }

  console.log('TOTAL PRODUCTS:', products.length);
  console.log('TOTAL CATEGORIES: 26');
  console.log('REAL IMAGES:', real);
  console.log('PLACEHOLDER/MISSING:', missing);
  console.log('CATEGORY-WISE IMAGE STATUS:');
  for (const catName of Object.keys(catStats).sort()) {
    const stat = catStats[catName];
    if (stat.total === 0) continue;
    console.log(`  - ${catName}: ${stat.total} total, ${stat.real} real, ${stat.missing} missing`);
  }
  console.log('NEXT CATEGORY:', nextCat);
  console.log('PRODUCTS NEEDING IMAGES:', catStats[nextCat].missing);
  console.log('EXACT PRODUCT NAMES TO COLLECT:');
  catStats[nextCat].missingNames.forEach(n => console.log('  - ' + n));
}
run();
