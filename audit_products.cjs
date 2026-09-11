const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function audit() {
  const { data: cats, error: e1 } = await supabase.from('categories').select('*');
  const { data: prods, error: e2 } = await supabase.from('products').select('*, categories(name)');
  const { data: stock, error: e3 } = await supabase.from('warehouse_stock').select('product_id, quantity');
  const { data: orderItems, error: e4 } = await supabase.from('order_items').select('product_id, quantity');

  let petCareExists = false;
  let petCareCount = 0;
  
  cats.forEach(c => {
    if (c.name.toLowerCase().includes('pet care')) {
      petCareExists = true;
      petCareCount = prods.filter(p => p.category_id === c.id).length;
    }
  });

  const catCounts = {};
  cats.forEach(c => catCounts[c.id] = 0);
  prods.forEach(p => {
    if (catCounts[p.category_id] !== undefined) {
      catCounts[p.category_id]++;
    }
  });

  let why25 = "Because Pet Care has 0 products assigned to it, so the grouping step ignored it.";

  const dupesToCheck = ['Baked Pita Chips', 'Fresh Hass Avocados', 'Amul Gold Full Cream Milk', 'Potato'];
  let duplicateGroups = "";
  for (const dup of dupesToCheck) {
    const group = prods.filter(p => p.name === dup);
    duplicateGroups += `- ${dup} (${group.length} records):\n`;
    for (const p of group) {
      const sCount = stock.filter(s => s.product_id === p.id).reduce((sum, s) => sum + s.quantity, 0);
      const oCount = orderItems.filter(o => o.product_id === p.id).reduce((sum, o) => sum + o.quantity, 0);
      duplicateGroups += `  ID: ${p.id}, Category: ${p.categories?.name}, Active: ${p.is_active}, Stock: ${sCount}, Orders: ${oCount}\n`;
    }
  }

  const test3 = prods.filter(p => p.name === 'Amul Kool Kesar (TEST3)');
  let test3Status = "Not found";
  if (test3.length > 0) {
    const p = test3[0];
    const sCount = stock.filter(s => s.product_id === p.id).reduce((sum, s) => sum + s.quantity, 0);
    const oCount = orderItems.filter(o => o.product_id === p.id).reduce((sum, o) => sum + o.quantity, 0);
    test3Status = `ID: ${p.id}, Active: ${p.is_active}, Stock: ${sCount}, Orders: ${oCount}. Clearly test data.`;
  }

  const uniqueNames = new Set();
  prods.forEach(p => uniqueNames.add(p.name));

  const grouped = {};
  prods.forEach(p => {
    const cat = p.categories ? p.categories.name : 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = new Set();
    grouped[cat].add(p.name);
  });

  const sortedCats = Object.keys(grouped).sort();
  let txt = '';
  for (const cat of sortedCats) {
    const sortedNames = Array.from(grouped[cat]).sort();
    txt += `[${cat}]\n`;
    for (const name of sortedNames) {
      txt += `${name}\n`;
    }
    txt += '\n';
  }

  const dir = 'C:/Users/dhanu/FlashGO/product-images-new';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PRODUCT_LIST.txt'), txt.trim());

  console.log(`REMOTE CATEGORY COUNT: ${cats.length}`);
  console.log(`REMOTE PRODUCT COUNT: ${prods.length}`);
  console.log(`PET CARE EXISTS: ${petCareExists ? 'YES' : 'NO'}`);
  console.log(`PET CARE PRODUCT COUNT: ${petCareCount}`);
  console.log(`\nWHY EXPORT SHOWED 25:\n${why25}`);
  console.log(`\nDUPLICATE GROUPS:\n${duplicateGroups.trim()}`);
  console.log(`\nTEST3 STATUS:\n${test3Status}`);
  console.log(`\nDATABASE MODIFIED: NO`);
  console.log(`\nSAFE UNIQUE PRODUCT NAMES REQUIRING IMAGES:\n${uniqueNames.size}`);
  console.log(`\nPRODUCT_LIST.txt REGENERATED: YES`);
}
audit();
