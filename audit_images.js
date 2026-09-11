import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const { data: prods } = await supabase.from('products').select('*, categories(name)');
  
  let total = prods.length;
  let withImage = 0;
  let missingImage = 0;
  let malformed = 0;
  
  let imageUrls = new Set();
  let duplicateCount = 0;
  
  let missingList = [];
  
  for (const p of prods) {
    if (!p.image_url || p.image_url.trim() === '') {
      missingImage++;
      missingList.push(`${p.name} | ${p.sku} | ${p.categories ? p.categories.name : 'Unknown'} | NULL`);
    } else {
      withImage++;
      try {
        new URL(p.image_url);
        // Valid URL syntax
      } catch (e) {
        // Only if it doesn't start with / or ./ 
        if (!p.image_url.startsWith('/') && !p.image_url.startsWith('./') && !p.image_url.startsWith('../')) {
           malformed++;
        }
      }
      
      if (imageUrls.has(p.image_url)) {
        duplicateCount++;
      } else {
        imageUrls.add(p.image_url);
      }
    }
  }
  
  console.log(`TOTAL PRODUCTS: ${total}`);
  console.log(`WITH IMAGE: ${withImage}`);
  console.log(`MISSING IMAGE: ${missingImage}`);
  console.log(`MALFORMED IMAGE URL: ${malformed}`);
  console.log(`DUPLICATE IMAGE URL COUNT: ${duplicateCount}`);
  
  console.log('\\n--- MISSING LIST ---');
  missingList.forEach(m => console.log(m));
})();
