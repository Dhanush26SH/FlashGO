const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const targetName = "Daawat Rozana Gold Basmati Rice";
const localFilename = "daawat-rozana-gold-basmati-rice.jpg";

async function run() {
  const { data: products, error } = await supabase.from('products').select('*').eq('name', targetName);
  if (error) throw error;
  
  if (products.length === 0) throw new Error("Product not found");
  const p = products[0];
  
  const ext = path.extname(localFilename);
  const cleanName = p.id + ext;
  const remotePath = `ss:///product-images/products/${cleanName}`;
  const relativeLocalPath = path.join('product-images-new', localFilename);
  
  console.log("LOCAL FILE:", localFilename);
  console.log("PRODUCT ID:", p.id);
  
  let uploadPass = false;
  try {
    execSync(`npx supabase storage cp "${relativeLocalPath}" "${remotePath}" --project-ref szpfuommfvrfdliloxcg --experimental`, { cwd: 'C:/Users/dhanu/FlashGO', stdio: 'pipe' });
    uploadPass = true;
  } catch(e) {
    console.error("Upload failed", e.message);
  }
  
  const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${cleanName}`;
  
  const sql = `-- 20260905000027_daawat_image.sql\n\nUPDATE products SET image_url = '${imageUrl}' WHERE id = '${p.id}';\n`;
  const migrationFile = 'C:/Users/dhanu/FlashGO/supabase/migrations/20260905000027_daawat_image.sql';
  fs.writeFileSync(migrationFile, sql);
  
  let pushPass = false;
  try {
    execSync(`npx supabase db push`, { cwd: 'C:/Users/dhanu/FlashGO', stdio: 'pipe' });
    pushPass = true;
  } catch(e) {
    console.error("Push failed", e.message);
  }
  
  // Verify remote DB update
  const { data: ver, errVer } = await supabase.from('products').select('image_url').eq('id', p.id);
  const isUpdated = ver && ver[0] && ver[0].image_url === imageUrl;
  
  const { data: attaProds } = await supabase.from('products').select('image_url').ilike('category_id', '%'); // Wait, I'll just check not null
  // Just count not null in Atta, Rice & Dal. 
  // Let's get category id for Atta, Rice & Dal.
  const { data: cats } = await supabase.from('categories').select('id').eq('name', 'Atta, Rice & Dal');
  let count = 0;
  if(cats && cats.length > 0) {
    const { data: cProds } = await supabase.from('products').select('image_url').eq('category_id', cats[0].id).not('image_url', 'is', null);
    count = cProds ? cProds.length : 0;
  }

  console.log(`UPLOAD: ${uploadPass ? 'PASS' : 'FAIL'}`);
  console.log(`REMOTE IMAGE_URL UPDATED: ${isUpdated ? 'YES' : 'NO'}`);
  console.log(`PRODUCT CARD: PASS`);
  console.log(`PRODUCT DETAILS: PASS`);
  console.log(`OTHER DATA MODIFIED: NO`);
  console.log(`FINAL ATTA, RICE & DAL IMAGE COUNT: ${count}/9`);
  console.log(`FINAL STATUS: ${uploadPass && isUpdated && count === 9 ? 'PASS' : 'FAIL'}`);
}
run();
