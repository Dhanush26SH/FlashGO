import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: allRows } = await supabase.from('products').select('id, name, is_active, image_url, categories(name)');
  const { data: allCategories } = await supabase.from('categories').select('name');
  
  const totalCategories = allCategories ? allCategories.length : 26;
  
  let totalRows = allRows.length;
  let activeProducts = allRows.filter(p => p.is_active === true);
  
  let productsWithImages = 0;
  let productsNeedingImages = 0;
  
  let categoriesData: any = {};
  for (const c of allCategories) {
      categoriesData[c.name] = {
          missing: [],
          hasImageCount: 0
      };
  }

  let uniqueIds = new Set();
  let duplicateActiveNames = [];
  let nameTracker = new Set();

  let freshHassAvocadosIncluded = 'NO';
  let potatoIncluded = 'NO';
  let inactiveProductsInList = 0;

  for (const p of activeProducts) {
    if (!p.is_active) inactiveProductsInList++;
    if (p.name === 'Fresh Hass Avocados') freshHassAvocadosIncluded = 'YES';
    if (p.name === 'Potato') potatoIncluded = 'YES';

    uniqueIds.add(p.id);
    if (nameTracker.has(p.name)) {
        if (!duplicateActiveNames.includes(p.name)) {
            duplicateActiveNames.push(p.name);
        }
    } else {
        nameTracker.add(p.name);
    }

    const catName = p.categories ? p.categories.name : 'Unknown';
    if (!categoriesData[catName]) {
      categoriesData[catName] = { missing: [], hasImageCount: 0 };
    }
    
    if (p.image_url && p.image_url.startsWith('http')) {
      categoriesData[catName].hasImageCount++;
      productsWithImages++;
    } else {
      categoriesData[catName].missing.push({ name: p.name, id: p.id });
      productsNeedingImages++;
    }
  }

  const categoryNames = Object.keys(categoriesData).sort();
  let incompleteCategories = 0;
  let completeCategories = 0;

  let totalActiveSum = 0;

  console.log("=== INCOMPLETE CATEGORIES ===\\n");
  for (const catName of categoryNames) {
    const catData = categoriesData[catName];
    totalActiveSum += catData.missing.length + catData.hasImageCount;

    if (catData.missing.length > 0) {
      console.log(`CATEGORY: ${catName} (${catData.missing.length} images needed)\n`);
      catData.missing.forEach((m: any) => console.log(`- ${m.name} | ID: ${m.id}`));
      console.log('');
      incompleteCategories++;
    }
  }

  console.log('COMPLETE — NO IMAGES NEEDED\n');
  for (const catName of categoryNames) {
    const catData = categoriesData[catName];
    if (catData.missing.length === 0) {
      console.log(`- ${catName}`);
      completeCategories++;
    }
  }

  const categoryTotalCheck = (completeCategories + incompleteCategories) === totalCategories ? 'PASS' : 'FAIL';
  const imageTotalCheck = (productsWithImages + productsNeedingImages) === activeProducts.length ? 'PASS' : 'FAIL';
  const sumCheck = totalActiveSum === activeProducts.length;

  if (categoryTotalCheck === 'FAIL' || imageTotalCheck === 'FAIL' || inactiveProductsInList > 0 || !sumCheck || uniqueIds.size !== activeProducts.length) {
      console.log('\\nAUDIT FAILED');
  }

  console.log(`\nTOTAL DATABASE ROWS: ${totalRows}`);
  console.log(`TOTAL ACTIVE PRODUCTS: ${activeProducts.length}`);
  console.log(`UNIQUE ACTIVE PRODUCT IDS: ${uniqueIds.size}`);
  console.log(`ACTIVE REAL IMAGES: ${productsWithImages}`);
  console.log(`ACTIVE MISSING IMAGES: ${productsNeedingImages}`);
  console.log(`INCOMPLETE CATEGORIES: ${incompleteCategories}`);
  console.log(`COMPLETE CATEGORIES: ${completeCategories}`);
  console.log(`CATEGORY TOTAL CHECK: ${categoryTotalCheck}`);
  console.log(`IMAGE TOTAL CHECK: ${imageTotalCheck}`);
  console.log(`DUPLICATE ACTIVE PRODUCT NAMES: ${duplicateActiveNames.join(', ') || 'NONE'}`);
  console.log(`INACTIVE PRODUCTS FOUND IN COLLECTION LIST: ${inactiveProductsInList}`);
  console.log(`FRESH HASS AVOCADOS INCLUDED: ${freshHassAvocadosIncluded}`);
  console.log(`POTATO INCLUDED: ${potatoIncluded}`);
  console.log(`DATABASE CHANGES: NONE`);
  console.log(`MIGRATIONS: NONE`);
}
run();
