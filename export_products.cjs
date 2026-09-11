const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('products').select('name, categories(name)');
  if (error) throw error;
  const grouped = {};
  for (const p of data) {
    const cat = p.categories ? p.categories.name : 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p.name);
  }
  const cats = Object.keys(grouped).sort();
  let txt = '';
  let consoleTxt = '';
  for (const cat of cats) {
    grouped[cat].sort((a, b) => a.localeCompare(b));
    txt += `[${cat}]\n`;
    consoleTxt += `${cat.toUpperCase()}\n`;
    for (const name of grouped[cat]) {
      txt += `${name}\n`;
      consoleTxt += `- ${name}\n`;
    }
    txt += '\n';
    consoleTxt += '\n';
  }
  const dir = 'C:/Users/dhanu/FlashGO/product-images-new';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PRODUCT_LIST.txt'), txt.trim());
  console.log(consoleTxt.trim());
  console.log('\nTOTAL PRODUCTS: ' + data.length);
  console.log('TOTAL CATEGORIES: ' + cats.length);
  console.log('PRODUCT_LIST.txt CREATED: YES');
}
run();
