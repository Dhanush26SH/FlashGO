import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const { data: prods } = await supabase.from('products').select('*, categories(name)').order('name');
  
  let md = "# Product Image Manifest\\n\\n";
  md += "| ID | SKU | Product Name | Category | Proposed Image Source | Source Type | Confidence |\\n";
  md += "|---|---|---|---|---|---|---|\\n";
  
  let exact = 0, generic = 0, fallback = 0, unresolved = 0;
  
  for (const p of prods) {
    let source = "TBD";
    let type = "UNRESOLVED";
    let conf = "Low";
    
    const n = p.name.toLowerCase();
    // Try to match local 16 images
    if (n.includes('banana')) {
      source = "public/products/p1.jpg"; type = "GENERIC_PRODUCT"; conf = "High"; generic++;
    } else if (n.includes('apple') && !n.includes('drink') && !n.includes('juice')) {
      source = "public/products/p2.jpg"; type = "GENERIC_PRODUCT"; conf = "High"; generic++;
    } else if (n.includes('asparagus')) {
      source = "public/products/p3.jpg"; type = "GENERIC_PRODUCT"; conf = "High"; generic++;
    } else if (n.includes('cucumber')) {
      source = "public/products/p4.jpg"; type = "GENERIC_PRODUCT"; conf = "High"; generic++;
    } else if (n.includes('milk') && !n.includes('chocolate')) {
      source = "public/products/p5.jpg"; type = "GENERIC_PRODUCT"; conf = "High"; generic++;
    } else {
      unresolved++;
    }
    
    md += `| ${p.id} | ${p.sku} | ${p.name} | ${p.categories ? p.categories.name : ''} | ${source} | ${type} | ${conf} |\\n`;
  }
  
  md += "\\n## Summary\\n";
  md += `- EXACT: ${exact}\\n`;
  md += `- GENERIC_PRODUCT: ${generic}\\n`;
  md += `- CATEGORY_FALLBACK: ${fallback}\\n`;
  md += `- UNRESOLVED: ${unresolved}\\n`;
  
  fs.writeFileSync('C:/Users/dhanu/.gemini/antigravity-ide/brain/eda67385-29b3-4be3-a272-031114e0e8bd/product_image_manifest.md', md);
  console.log("Manifest created.");
})();
