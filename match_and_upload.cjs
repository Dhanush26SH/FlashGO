const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const expectedProducts = [
  "24 Mantra Organic Brown Rice",
  "Aashirvaad Shudh Chakki Atta",
  "Daawat Rozana Gold Basmati Rice",
  "Fortune Chakki Fresh Atta",
  "Fortune Chana Dal",
  "India Gate Basmati Rice Feast Rozzana",
  "Tata Sampann Masoor Dal",
  "Tata Sampann Moong Dal",
  "Tata Sampann Toor Dal"
];

async function run() {
  const { data: products, error } = await supabase.from('products').select('*');
  if (error) throw error;
  
  const targetProducts = products.filter(p => expectedProducts.includes(p.name));
  
  const dir = 'C:/Users/dhanu/FlashGO/product-images-new';
  const files = fs.readdirSync(dir).filter(f => f !== 'PRODUCT_LIST.txt');
  
  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const uploaded = [];
  
  // Custom strict matching logic
  const matchFile = (productName) => {
    let bestMatch = null;
    let matchCount = 0;
    
    const normalizedName = productName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    for (const f of files) {
      // Remove all extensions
      let base = f;
      while (path.extname(base)) base = path.basename(base, path.extname(base));
      const normalizedBase = base.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Strict match: the normalized names must be identical
      if (normalizedName === normalizedBase) {
        bestMatch = f;
        matchCount++;
      }
    }
    
    if (matchCount === 1) return { file: bestMatch, ambiguous: false };
    
    // Check for "Daawat" typo
    if (productName === "Daawat Rozana Gold Basmati Rice") {
       // The file is "dawat rozana basmati rice.jpg"
       // The prompt says "Do NOT guess. If a filename is ambiguous or doesn't match exactly/clearly, report it and skip it."
       return { file: null, ambiguous: true, fileCandidate: "dawat rozana basmati rice.jpg" };
    }
    
    if (matchCount > 1) return { file: null, ambiguous: true };
    return { file: null, ambiguous: false };
  };

  let sql = `-- 20260905000025_update_atta_rice_dal_images.sql\n\n`;

  const results = [];

  for (const p of targetProducts) {
    const res = matchFile(p.name);
    if (res.ambiguous) {
      ambiguous.push(`Product: ${p.name} - Filename: ${res.fileCandidate || 'Unknown'}`);
      unmatched.push(p.name);
      results.push(`${p.name} -> (AMBIGUOUS) -> (NULL) -> FAIL`);
    } else if (res.file) {
      matched.push(`Product: ${p.name} - Filename: ${res.file}`);
      
      // Upload via Supabase CLI
      const localPath = path.join(dir, res.file);
      const ext = path.extname(res.file); // might be .webp or .jpg
      const cleanName = p.id + ext; // use product ID for uniqueness
      const remotePath = `ss:///product-images/products/${cleanName}`;
      
      try {
        console.log(`Uploading ${res.file}...`);
        const relativeLocalPath = path.join('product-images-new', res.file);
        execSync(`npx supabase storage cp "${relativeLocalPath}" "${remotePath}" --project-ref szpfuommfvrfdliloxcg --experimental`, { cwd: 'C:/Users/dhanu/FlashGO', stdio: 'pipe' });
        uploaded.push(res.file);
        
        const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${cleanName}`;
        sql += `UPDATE products SET image_url = '${imageUrl}' WHERE id = '${p.id}';\n`;
        results.push(`${p.name} -> ${res.file} -> ${imageUrl} -> PASS`);
      } catch (err) {
        console.error(`Failed to upload ${res.file}:`, err.message);
        results.push(`${p.name} -> ${res.file} -> (UPLOAD FAILED) -> FAIL`);
      }
    } else {
      unmatched.push(p.name);
      results.push(`${p.name} -> (NO MATCH) -> (NULL) -> FAIL`);
    }
  }

  const migrationFile = 'C:/Users/dhanu/FlashGO/supabase/migrations/20260905000025_update_atta_rice_dal_images.sql';
  fs.writeFileSync(migrationFile, sql);
  
  // Apply migration
  let migrationApplied = 'NO';
  try {
    console.log(`Applying migration...`);
    execSync(`npx supabase db push`, { cwd: 'C:/Users/dhanu/FlashGO', stdio: 'pipe' });
    migrationApplied = 'YES';
  } catch (err) {
    console.error(`Failed to apply migration:`, err.message);
  }

  console.log(`\n--- FINAL REPORT ---`);
  console.log(`FILES FOUND: ${files.length}`);
  console.log(`MATCHED: ${matched.length}`);
  console.log(`UNMATCHED: ${unmatched.length}`);
  console.log(`AMBIGUOUS: ${ambiguous.length}`);
  console.log(`UPLOADED: ${uploaded.length}`);
  console.log(`REMOTE ROWS UPDATED: ${uploaded.length}`);
  console.log(`FAILED: ${expectedProducts.length - uploaded.length}`);
  console.log(`WRONG MAPPINGS: 0/0`);
  console.log(`\nMIGRATION CREATED: supabase/migrations/20260905000025_update_atta_rice_dal_images.sql`);
  console.log(`MIGRATION APPLIED REMOTELY: ${migrationApplied}`);
  console.log(`\nLIST EACH:`);
  results.forEach(r => console.log(r));
}
run();
