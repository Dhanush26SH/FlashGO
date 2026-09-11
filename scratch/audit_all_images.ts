import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: allRows } = await supabase.from('products').select('id, name, is_active, image_url, categories(name)');
  
  let totalRows = allRows.length;
  let activeProducts = allRows.filter(p => p.is_active);
  let totalCategories = 26; // There are 26 categories in FlashGO DB
  
  let productsWithImages = 0;
  let productsNeedingImages = 0;
  
  let categoriesData: any = {};

  for (const p of activeProducts) {
    const catName = p.categories ? p.categories.name : 'Unknown';
    if (!categoriesData[catName]) {
      categoriesData[catName] = {
        total: 0,
        missingNames: [],
        hasImageCount: 0
      };
    }
    categoriesData[catName].total++;
    
    if (p.image_url && p.image_url.startsWith('http')) {
      categoriesData[catName].hasImageCount++;
      productsWithImages++;
    } else {
      categoriesData[catName].missingNames.push(p.name);
      productsNeedingImages++;
    }
  }

  const categoryNames = Object.keys(categoriesData).sort();
  let incompleteCategories = 0;
  let completeCategories = 0;

  for (const catName of categoryNames) {
    const catData = categoriesData[catName];
    if (catData.missingNames.length > 0) {
      console.log(`CATEGORY: ${catName} (${catData.missingNames.length} images needed)\n`);
      catData.missingNames.forEach((n: string) => console.log(n));
      console.log('');
      incompleteCategories++;
    }
  }

  console.log('COMPLETE — NO IMAGES NEEDED\n');
  for (const catName of categoryNames) {
    const catData = categoriesData[catName];
    if (catData.missingNames.length === 0) {
      console.log(`- ${catName}`);
      completeCategories++;
    }
  }
  
  const emptyCategories = totalCategories - Object.keys(categoriesData).length;
  completeCategories += emptyCategories;

  console.log(`\nTOTAL DATABASE PRODUCT ROWS: ${totalRows}`);
  console.log(`TOTAL ACTIVE PRODUCTS: ${activeProducts.length}`);
  console.log(`TOTAL CATEGORIES: ${totalCategories}`);
  console.log(`ACTIVE PRODUCTS WITH REAL IMAGES: ${productsWithImages}`);
  console.log(`ACTIVE PRODUCTS STILL NEEDING IMAGES: ${productsNeedingImages}`);
  console.log(`INCOMPLETE CATEGORIES: ${incompleteCategories}`);
  console.log(`COMPLETE CATEGORIES: ${completeCategories}`);
  console.log(`DATABASE CHANGES: NONE`);
  console.log(`MIGRATIONS: NONE`);
}
run();
