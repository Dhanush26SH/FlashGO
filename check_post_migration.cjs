const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');
async function check() {
  const prods = await supabase.from('products').select('*, categories(name)');
  const cats = await supabase.from('categories').select('*');
  console.log('Products:', prods.data.length);
  console.log('Categories:', cats.data.length);
  let dist = {};
  prods.data.forEach(p => {
    dist[p.categories.name] = (dist[p.categories.name] || 0) + 1;
  });
  console.log('Distribution:');
  Object.entries(dist).sort((a,b) => b[1] - a[1]).forEach(x => console.log(x[0] + ': ' + x[1]));
  console.log('Spot Checks:');
  const spots = [
    '24 Mantra Organic Brown Rice',
    'Aashirvaad Shudh Chakki Atta',
    'Amul Pure Ghee',
    'Britannia Bourbon The Original',
    'Nestlé KitKat 4 Finger',
    'Apple Royal Gala',
    'Banana Robusta',
    'Potato',
    'Fresh Hass Avocados',
    'Apsara Platinum Pencils',
    'Bajaj Majesty DX 11 Dry Iron',
    'Amul Chocolate Magic Ice Cream Tub',
    'Chicken Breast Boneless',
    'Prawns Cleaned',
    "Ching's Schezwan Chutney",
    'Maggi 2-Minute Masala Noodles',
    'Knorr Classic Sweet Corn Veg Soup',
    'MTR Ready to Eat Dal Makhani',
    'Ariel Matic Top Load Detergent Powder',
    'Harpic Power Plus Toilet Cleaner Original',
    'Savlon Antiseptic Liquid',
    'Vim Dishwash Gel Lemon'
  ];
  spots.forEach(s => {
    let p = prods.data.find(x => x.name === s);
    console.log(s + ' -> ' + (p ? p.categories.name : 'NOT FOUND'));
  });
}
check();
