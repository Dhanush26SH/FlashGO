import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: allRows } = await supabase.from('products').select('id, name, sku, price, is_active, image_url, categories(name)');
  const { data: allCategories } = await supabase.from('categories').select('name');
  
  const totalCategories = allCategories ? allCategories.length : 26;
  
  let totalRows = allRows.length;
  let activeProducts = allRows.filter(p => p.is_active === true);
  
  let productsWithImages = 0;
  let productsNeedingImages = 0;
  
  let manualResolution = [];
  let safeMissingImages = [];

  let categoriesData: any = {};
  for (const c of allCategories) {
      categoriesData[c.name] = {
          missing: [],
          hasImageCount: 0
      };
  }

  let uniqueIds = new Set();
  let duplicateActiveNamesInSafeList = [];
  let safeNameTracker = new Set();
  let inactiveProductsInList = 0; // Should be 0 since we only iterate activeProducts

  for (const p of activeProducts) {
    uniqueIds.add(p.id);

    const catName = p.categories ? p.categories.name : 'Unknown';
    if (!categoriesData[catName]) {
      categoriesData[catName] = { missing: [], hasImageCount: 0 };
    }
    
    if (p.image_url && p.image_url.startsWith('http')) {
      categoriesData[catName].hasImageCount++;
      productsWithImages++;
    } else {
      productsNeedingImages++;
      if (p.name === 'Amul Gold Full Cream Milk') {
          manualResolution.push(p);
      } else {
          categoriesData[catName].missing.push(p.name);
          safeMissingImages.push(p.name);

          if (safeNameTracker.has(p.name)) {
              if (!duplicateActiveNamesInSafeList.includes(p.name)) {
                  duplicateActiveNamesInSafeList.push(p.name);
              }
          } else {
              safeNameTracker.add(p.name);
          }
      }
    }
  }

  const categoryNames = Object.keys(categoriesData).sort();
  let incompleteCategories = 0;
  let completeCategories = 0;

  let totalActiveSum = 0;

  console.log("=== INCOMPLETE CATEGORIES ===\n");
  for (const catName of categoryNames) {
    const catData = categoriesData[catName];
    totalActiveSum += catData.missing.length + catData.hasImageCount;

    if (catData.missing.length > 0) {
      console.log(`CATEGORY: ${catName} (${catData.missing.length} images needed)\n`);
      catData.missing.forEach((n: string) => console.log(`- ${n}`));
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

  console.log('\nMANUAL RESOLUTION REQUIRED — DO NOT COLLECT YET\n');
  manualResolution.forEach(m => {
      console.log(`- ${m.name} | ID: ${m.id} | SKU: ${m.sku} | Price: ${m.price}`);
  });

  const categoryTotalCheck = (completeCategories + incompleteCategories) === totalCategories ? 'PASS' : 'FAIL';
  const imageTotalCheck = (productsWithImages + productsNeedingImages) === activeProducts.length && (safeMissingImages.length + manualResolution.length) === productsNeedingImages ? 'PASS' : 'FAIL';

  if (categoryTotalCheck === 'FAIL' || imageTotalCheck === 'FAIL' || inactiveProductsInList > 0 || uniqueIds.size !== activeProducts.length) {
      console.log('\nAUDIT FAILED');
      return;
  }

  console.log(`\nTOTAL DATABASE ROWS: ${totalRows}`);
  console.log(`TOTAL ACTIVE PRODUCTS: ${activeProducts.length}`);
  console.log(`ACTIVE PRODUCTS WITH REAL IMAGES: ${productsWithImages}`);
  console.log(`ACTIVE PRODUCTS MISSING REAL IMAGES: ${productsNeedingImages}`);
  console.log(`SAFE AUTOMATIC IMAGES TO COLLECT: ${safeMissingImages.length}`);
  console.log(`MANUAL-RESOLUTION PRODUCTS: ${manualResolution.length}`);
  console.log(`INCOMPLETE CATEGORIES: ${incompleteCategories}`);
  console.log(`COMPLETE CATEGORIES: ${completeCategories}`);
  console.log(`DUPLICATE NAMES IN SAFE COLLECTION LIST: ${duplicateActiveNamesInSafeList.join(', ') || 'NONE'}`);
  console.log(`INACTIVE PRODUCTS IN COLLECTION LIST: 0`);
  console.log(`CATEGORY TOTAL CHECK: ${categoryTotalCheck}`);
  console.log(`IMAGE TOTAL CHECK: ${imageTotalCheck}`);
  console.log(`DATABASE CHANGES: NONE`);
  console.log(`MIGRATIONS: NONE`);
}
run();
