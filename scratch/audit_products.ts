import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://szpfuommfvrfdliloxcg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6cGZ1b21tZnZyZmRsaWxveGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2ODY2MCwiZXhwIjoyMDk0OTQ0NjYwfQ.mIZTVwTMW40y0sKog6c4p9gko2qWtDmty8IkZv2lYc8';
const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
  console.log('Fetching database data...');
  
  // 1. Fetch categories
  const { data: categories } = await supabase.from('categories').select('id, name');
  const catMap = new Map();
  if (categories) {
    categories.forEach(c => catMap.set(c.id, c.name));
  }
  
  // 2. Fetch products
  const { data: products, error: prodErr } = await supabase.from('products').select('*');
  if (prodErr) throw prodErr;
  
  // 3. Fetch vendors
  const { data: vendors, error: vendErr } = await supabase.from('vendors').select('*');
  if (vendErr) throw vendErr;
  
  // 4. Check mapping tables (vendor_products etc)
  let vendorProductsTableExists = false;
  const { error: mappingErr } = await supabase.from('vendor_products').select('*').limit(1);
  if (!mappingErr) {
    vendorProductsTableExists = true;
  }
  
  const totalProducts = products!.length;
  const activeProducts = products!.filter(p => p.is_active);
  const inactiveProducts = products!.filter(p => !p.is_active);
  
  console.log('--- SCHEMA FINDINGS ---');
  console.log('Total Product Rows:', totalProducts);
  console.log('Total Active Products:', activeProducts.length);
  console.log('Total Inactive Products:', inactiveProducts.length);
  console.log('Category Count:', categories?.length || 0);
  console.log('Vendors Count:', vendors?.length || 0);
  console.log('Vendors:', vendors?.map(v => v.name).join(', '));
  console.log('Vendor Columns:', Object.keys(vendors?.[0] || {}).join(', '));
  console.log('vendor_products Table Exists:', vendorProductsTableExists);
  console.log('Product has vendor field:', products!.length > 0 && 'vendor_id' in products![0]);
  
  const detectBrand = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('amul')) return 'Amul';
    if (n.includes('britannia') || n.includes('good day') || n.includes('marigold') || n.includes('nutrichoice') || n.includes('milk bikis')) return 'Britannia';
    if (n.includes('aashirvaad') || n.includes('sunfeast') || n.includes('bingo') || n.includes('yippee')) return 'ITC/Aashirvaad';
    if (n.includes('ariel') || n.includes('tide') || n.includes('gillette') || n.includes('oral-b') || n.includes('head & shoulders') || n.includes('pantene') || n.includes('whisper')) return 'P&G';
    if (n.includes('eveready')) return 'Eveready';
    if (n.includes('duracell')) return 'Duracell';
    if (n.includes('coca-cola') || n.includes('coke') || n.includes('sprite') || n.includes('thums up') || n.includes('maaza') || n.includes('kinley')) return 'Coca-Cola';
    if (n.includes('pepsi') || n.includes('lay') || n.includes('kurkure') || n.includes('doritos') || n.includes('tropicana') || n.includes('mountain dew') || n.includes('mirinda')) return 'PepsiCo';
    if (n.includes('nestle') || n.includes('maggi') || n.includes('kitkat') || n.includes('nescafe') || n.includes('munch') || n.includes('milkybar')) return 'Nestle';
    if (n.includes('surf excel') || n.includes('rin') || n.includes('vim') || n.includes('kissan') || n.includes('knorr') || n.includes('lifebuoy') || n.includes('dove') || n.includes('ponds') || n.includes('vaseline') || n.includes('clinic plus') || n.includes('sunsilk') || n.includes('tresemme') || n.includes('axe') || n.includes('bru') || n.includes('lakme')) return 'Unilever';
    if (n.includes('parle') || n.includes('milano') || n.includes('hide & seek') || n.includes('krackjack') || n.includes('monaco')) return 'Parle';
    if (n.includes('haldiram')) return 'Haldiram';
    if (n.includes('dettol') || n.includes('harpic') || n.includes('lizol') || n.includes('mortein') || n.includes('veet')) return 'Reckitt';
    if (n.includes('fortune') || n.includes('adani')) return 'Adani Wilmar';
    if (n.includes('tata') || n.includes('sampann') || n.includes('tetley')) return 'Tata Consumer Products';
    if (n.includes('colgate') || n.includes('palmolive')) return 'Colgate-Palmolive';
    if (n.includes('dabur') || n.includes('real juice') || n.includes('vatika')) return 'Dabur';
    if (n.includes('godrej') || n.includes('cinthol') || n.includes('hit') || n.includes('aer')) return 'Godrej Consumer';
    if (n.includes('marico') || n.includes('parachute') || n.includes('saffola')) return 'Marico';
    if (n.includes('mother dairy') || n.includes('safal')) return 'Mother Dairy';
    if (n.includes('nandini')) return 'KMF/Nandini';
    if (n.includes('heritage')) return 'Heritage';
    if (n.includes('milky mist')) return 'Milky Mist';
    if (n.includes('id fresh') || n.includes('id batter')) return 'iD Fresh Food';
    if (n.includes('cavin')) return 'CavinKare';
    if (n.includes('himalaya')) return 'Himalaya';
    if (n.includes('pigeon') || n.includes('prestige') || n.includes('hawkins') || n.includes('wonderchef') || n.includes('borosil') || n.includes('cello') || n.includes('tupperware') || n.includes('milton')) return 'Kitchenware Brands';
    if (n.includes('boat') || n.includes('noise') || n.includes('fire-boltt') || n.includes('apple') || n.includes('samsung') || n.includes('oneplus') || n.includes('xiaomi') || n.includes('redmi') || n.includes('realme') || n.includes('oppo') || n.includes('vivo') || n.includes('sony') || n.includes('jbl') || n.includes('portronics')) return 'Electronics Brands';
    if (n.includes('durex') || n.includes('manforce') || n.includes('skore') || n.includes('kamasutra')) return 'Personal Care Brands';
    
    // Some basic heuristics based on names
    const parts = name.split(' ');
    if (parts.length > 0) {
       // if it starts with a common term, try to find brand
    }
    
    return 'NEEDS_RESEARCH';
  }

  let mappedCount = 0;
  let unmappedCount = 0;
  let needsResearchCount = 0;
  const brands = new Set();
  
  const csvRows = ['Product ID,SKU,Product Name,Category,Detected Brand,Existing Vendor,Vendor Mapping Status'];
  
  for (const p of activeProducts) {
    const brand = detectBrand(p.name);
    brands.add(brand);
    
    let existingVendor = 'None';
    let mappingStatus = 'UNMAPPED';
    if ('vendor_id' in p && p.vendor_id) {
       const v = vendors?.find(v => v.id === p.vendor_id);
       if (v) existingVendor = v.name;
       mappingStatus = 'MAPPED';
       mappedCount++;
    } else {
       if (brand === 'NEEDS_RESEARCH') {
         needsResearchCount++;
         mappingStatus = 'NEEDS_RESEARCH';
       } else {
         unmappedCount++;
       }
    }
    
    const catName = catMap.get(p.category_id) || 'Unknown';
    // Escaping commas
    const safeName = p.name.includes(',') ? `"${p.name}"` : p.name;
    const safeCat = catName.includes(',') ? `"${catName}"` : catName;
    const safeBrand = brand.includes(',') ? `"${brand}"` : brand;
    const safeVendor = existingVendor.includes(',') ? `"${existingVendor}"` : existingVendor;
    
    csvRows.push(`${p.id},${p.sku},${safeName},${safeCat},${safeBrand},${safeVendor},${mappingStatus}`);
  }
  
  fs.writeFileSync('C:\\Users\\dhanu\\FlashGO\\flashgo_product_vendor_audit.csv', csvRows.join('\n'));
  
  console.log('\n--- SUMMARY COUNTS ---');
  console.log('Active products:', activeProducts.length);
  console.log('Products already mapped to a vendor:', mappedCount);
  console.log('Products without vendor mapping:', unmappedCount + needsResearchCount);
  console.log('Unique detected brands:', brands.size);
  console.log('Products needing external research:', needsResearchCount);
  
}

audit().catch(console.error);
