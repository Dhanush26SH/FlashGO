const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szpfuommfvrfdliloxcg.supabase.co',
  'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37'
);

async function main() {
  const { data: products, error: productsError } = await supabase.from('products').select('*');
  const { data: categories, error: categoriesError } = await supabase.from('categories').select('*');
  
  if (productsError) {
    console.error(productsError);
    return;
  }

  if (products.length > 0) {
    console.log("Keys available on product:", Object.keys(products[0]).join(', '));
  }

  // Find chocolates/sweets in Gifting
  const sweetCategoryIds = categories.filter(c => c.name.toLowerCase().includes('sweet') || c.name.toLowerCase().includes('chocolate') || c.name.toLowerCase().includes('gift')).map(c => c.id);
  const giftingProducts = products.filter(p => sweetCategoryIds.includes(p.category_id));
  console.log("GIFTING - Eligible Products Count:", giftingProducts.length);
  if (giftingProducts.length > 0) {
    console.log("Gifting Examples:", giftingProducts.slice(0, 5).map(p => p.name));
  }

  // Find Decor in Home & Lifestyle
  const homeCategoryIds = categories.filter(c => c.name === 'Home & Lifestyle').map(c => c.id);
  // Specifically look for decor-sounding things or just check what is in Home & Lifestyle
  const homeProducts = products.filter(p => homeCategoryIds.includes(p.category_id));
  
  const decorProducts = homeProducts.filter(p => {
    const n = p.name.toLowerCase();
    return n.includes('lamp') || n.includes('vase') || n.includes('cushion') || n.includes('decor') || n.includes('candle') || n.includes('plant') || n.includes('rug');
  });

  console.log("HOME & LIFESTYLE - Total Products:", homeProducts.length);
  console.log("HOME & LIFESTYLE - All names:", homeProducts.map(p => p.name));
  console.log("DECOR - Eligible Products Count:", decorProducts.length);
  if (decorProducts.length > 0) {
    console.log("Decor Examples:", decorProducts.slice(0, 5).map(p => p.name));
  }

}

main();
