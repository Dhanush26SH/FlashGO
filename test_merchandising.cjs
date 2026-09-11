const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'mobile-customer/.env' });
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data: wh } = await supabase.from('warehouses').select('*');
  const udupi = wh.find(w => w.name.includes('Udupi')).id;
  const manipal = wh.find(w => w.name.includes('Manipal')).id;

  console.log('--- WAREHOUSE IDS ---');
  console.log('Udupi:', udupi);
  console.log('Manipal:', manipal);

  const tags = ['season:rainy', 'season:summer', 'season:winter', 'festival:diwali', 'festival:christmas'];
  for (const t of tags) {
    const { data, error } = await supabase.rpc('get_trending_by_tag', { p_warehouse_id: udupi, p_tag: t, p_limit: 5 });
    console.log(`\n--- Udupi ${t} ---`);
    console.log(`Results: ${data?.length || 0}`);
    if (error) console.error('Error:', error.message);
    if (data && data.length > 0) {
      data.forEach(d => console.log(`  - ${d.name} | Sold: ${d.total_sold} | Rev: ${d.total_revenue} | Stock: ${d.stock_quantity}`));
    }
  }

  console.log('\n--- Manipal summer ---');
  const { data: mani } = await supabase.rpc('get_trending_by_tag', { p_warehouse_id: manipal, p_tag: 'season:summer', p_limit: 3 });
  console.log(`Results: ${mani?.length || 0}`);
  if (mani && mani.length > 0) {
    mani.forEach(d => console.log(`  - ${d.name} | Sold: ${d.total_sold} | Rev: ${d.total_revenue} | Stock: ${d.stock_quantity}`));
  }
}
test();
