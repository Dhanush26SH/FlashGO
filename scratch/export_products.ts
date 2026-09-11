import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function exportProducts() {
  console.log('Fetching database data...');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku, name, is_active, categories(name)')
    .eq('is_active', true);
    
  if (error) {
    console.error('Products error:', error);
    throw error;
  }
  
  if (!products) {
    console.log('No products found.');
    return;
  }
  
  const formatted = products.map(p => ({
    product_id: p.id,
    sku: p.sku,
    product_name: p.name,
    category_name: (p.categories as any)?.name || 'Unknown',
    subcategory_name: '' // Subcategory column might not exist or be different. I'll just leave it empty.
  }));
  
  formatted.sort((a, b) => {
    if (a.category_name < b.category_name) return -1;
    if (a.category_name > b.category_name) return 1;
    if (a.product_name < b.product_name) return -1;
    if (a.product_name > b.product_name) return 1;
    return 0;
  });
  
  const catCountMap = new Map();
  const csvRows = ['product_id,sku,product_name,category_name,subcategory_name'];
  
  for (const p of formatted) {
    catCountMap.set(p.category_name, (catCountMap.get(p.category_name) || 0) + 1);
    const safeName = p.product_name.includes(',') ? `"${p.product_name}"` : p.product_name;
    const safeCat = p.category_name.includes(',') ? `"${p.category_name}"` : p.category_name;
    const safeSub = p.subcategory_name.includes(',') ? `"${p.subcategory_name}"` : p.subcategory_name;
    csvRows.push(`${p.product_id},${p.sku},${safeName},${safeCat},${safeSub}`);
  }
  
  const csvPath = 'C:\\Users\\dhanu\\FlashGO\\flashgo_active_products_for_supplier_research.csv';
  fs.writeFileSync(csvPath, csvRows.join('\n'));
  
  console.log('\n--- REPORT ---');
  console.log('1. Total exported rows:', formatted.length);
  console.log('2. Category count:', catCountMap.size);
  console.log('3. Product count per category:');
  const sortedCats = Array.from(catCountMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [cat, count] of sortedCats) {
    console.log(`   - ${cat}: ${count}`);
  }
  console.log('4. Exact CSV path:', csvPath);
}

exportProducts().catch(console.error);
