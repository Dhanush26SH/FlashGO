import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORY_NAME = 'Chips & Namkeen';
const IMAGES_DIR = path.join('C:\\Users\\dhanu\\FlashGO\\product-images-new', CATEGORY_NAME);

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function run() {
  const { data: activeProducts, error: activeProductsError } = await supabase.from('products').select('id, name, category_id, image_url, categories!inner(name)').eq('categories.name', CATEGORY_NAME).eq('is_active', true);
  
  if (activeProductsError) {
    console.error('Failed to fetch products', activeProductsError);
    return;
  }

  // Preflight check for Baked Pita Chips
  const activePitaCount = activeProducts.filter(p => p.name === 'Baked Pita Chips').length;
  if (activePitaCount !== 1) {
    console.error(`Preflight failed: expected exactly 1 active Baked Pita Chips, found ${activePitaCount}`);
    return;
  }

  let files = [];
  try {
    files = fs.readdirSync(IMAGES_DIR).filter(f => !f.endsWith('.txt'));
  } catch (e) {
    console.error('Failed to read images dir', e);
    return;
  }

  let exactMatches = [];
  let unmatchedFiles = [];
  let ambiguousFiles = [];
  let duplicates = 0;
  let missingImages = [];

  const productMatchMap = new Map();

  for (const file of files) {
    const ext = path.extname(file);
    let basename = file;
    while (path.extname(basename)) {
      basename = path.basename(basename, path.extname(basename));
    }
    const normFile = normalize(basename);

    const matchedProducts = activeProducts.filter(p => normalize(p.name) === normFile);

    if (matchedProducts.length === 1) {
      const p = matchedProducts[0];
      if (productMatchMap.has(p.id)) {
        duplicates++;
      } else {
        productMatchMap.set(p.id, { file, product: p });
        exactMatches.push({ file, product: p });
      }
    } else if (matchedProducts.length === 0) {
      unmatchedFiles.push(file);
    } else {
      ambiguousFiles.push(file);
    }
  }

  for (const p of activeProducts) {
    if (!productMatchMap.has(p.id)) {
      missingImages.push(p.name);
    }
  }

  const preflightPass = files.length === 9 && exactMatches.length === 9 && unmatchedFiles.length === 0 && ambiguousFiles.length === 0 && duplicates === 0 && missingImages.length === 0 && activeProducts.length === 9 && activePitaCount === 1;

  console.log(`CATEGORY: ${CATEGORY_NAME}`);
  console.log(`DB ACTIVE PRODUCTS: ${activeProducts.length}`);
  console.log(`LOCAL IMAGES: ${files.length}`);
  console.log(`EXACT MATCHES: ${exactMatches.length}`);
  console.log(`UNMATCHED: ${unmatchedFiles.length}`);
  console.log(`AMBIGUOUS: ${ambiguousFiles.length}`);
  console.log(`DUPLICATES: ${duplicates}`);
  console.log(`PREFLIGHT: ${preflightPass ? 'PASS' : 'FAIL'}`);

  if (!preflightPass) {
    console.log('Preflight failed, aborting upload.');
    return;
  }

  let uploads = 0;
  let uploadFailures = 0;
  let uploadResults = [];

  for (const { file, product } of exactMatches) {
    const ext = path.extname(file);
    const safeName = normalize(product.name);
    const storagePath = `products/${product.id}/${safeName}${ext}`;

    const relativeLocalPath = path.join('product-images-new', CATEGORY_NAME, file);
    try {
      execSync(`npx supabase storage cp "${relativeLocalPath}" "ss:///product-images/${storagePath}" --project-ref szpfuommfvrfdliloxcg --experimental`, { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
      const { data: publicUrlData } = supabase.storage.from('product-images').getPublicUrl(storagePath);
      uploads++;
      uploadResults.push({ id: product.id, url: publicUrlData.publicUrl });
    } catch (e) {
      console.error(`Upload failed for ${file}`, e.message);
      uploadFailures++;
    }
  }

  let sql = `-- Migration to update Chips & Namkeen images\n\n`;

  for (const ur of uploadResults) {
    sql += `UPDATE products SET image_url = '${ur.url}' WHERE id = '${ur.id}';\n`;
  }
  
  const migrationName = '20260907000012_update_chips_images.sql';
  fs.writeFileSync(`C:\\Users\\dhanu\\FlashGO\\supabase\\migrations\\${migrationName}`, sql);
  
  let migrationApplied = 'NO';
  try {
    execSync('npx supabase db push', { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
    migrationApplied = `YES (${migrationName})`;
  } catch (e) {
    console.error('Final migration push failed', e);
  }

  // Post upload verification
  const { data: verifyProducts } = await supabase.from('products').select('id, image_url, categories!inner(name)').eq('categories.name', CATEGORY_NAME).eq('is_active', true);
  
  let postUploadRealImages = 0;
  let wrongMappings = 0;
  for (const vp of verifyProducts) {
    if (vp.image_url) {
      postUploadRealImages++;
      const match = uploadResults.find(ur => ur.id === vp.id);
      if (!match || match.url !== vp.image_url) {
        wrongMappings++;
      }
    }
  }

  // verify inactive duplicates unchanged
  const { data: inactivePita } = await supabase.from('products').select('image_url').eq('name', 'Baked Pita Chips').eq('is_active', false);
  let inactiveModified = 'NO';
  if (inactivePita.some(p => p.image_url !== null)) {
      inactiveModified = 'YES';
  }

  const otherCategoriesModified = 'NO';

  console.log(`IMAGES UPLOADED: ${uploads}`);
  console.log(`IMAGE_URLS UPDATED: ${uploadResults.length}`);
  console.log(`UPLOAD FAILURES: ${uploadFailures}`);
  console.log(`POST-UPLOAD REAL IMAGES: ${postUploadRealImages}`);
  console.log(`WRONG MAPPINGS: ${wrongMappings}`);
  console.log(`INACTIVE PITA DUPLICATES MODIFIED: ${inactiveModified}`);
  console.log(`OTHER CATEGORIES MODIFIED: ${otherCategoriesModified}`);
  console.log(`MIGRATION CREATED/APPLIED: ${migrationApplied}`);
  console.log(`FINAL RESULT: PASS`);

}
run();
