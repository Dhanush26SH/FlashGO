import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const { data: cats } = await supabase.from('categories').select('*');
  const catMap = {};
  cats.forEach(c => catMap[c.id] = c.name);

  const seededCatIds = [
    'c0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000005',
    'c0000000-0000-0000-0000-000000000006'
  ];

  const { data: prods } = await supabase.from('products').select('id, name, category_id');

  const findDest = (name) => {
    const l = name.toLowerCase();
    if (l.includes('apple') || l.includes('banana') || l.includes('avocado') || l.includes('tomato') || l.includes('chilli') || l.includes('carrot') || l.includes('cucumber') || l.includes('pomegranate') || l.includes('onion') || l.includes('potato') || l.includes('ginger') || l.includes('garlic')) return 'Vegetables & Fruits';
    if (l.includes('milk') && !l.includes('drink') && !l.includes('chocolate')) return 'Dairy, Bread & Eggs';
    if (l.includes('cheese') || l.includes('paneer') || l.includes('butter') || l.includes('egg') || l.includes('bread')) return 'Dairy, Bread & Eggs';
    if (l.includes('chips') || l.includes('kurkure') || l.includes('doritos') || l.includes('namkeen')) return 'Chips & Namkeen';
    if (l.includes('drink') || l.includes('juice') || l.includes('coca') || l.includes('pepsi') || l.includes('sprite') || l.includes('thums up') || l.includes('maaza') || l.includes('frooti') || l.includes('water')) return 'Drinks & Juices';
    if (l.includes('tea') || l.includes('coffee') || l.includes('bournvita')) return 'Tea, Coffee & Milk Drinks';
    if (l.includes('maggi') || l.includes('noodles') || l.includes('soup') || l.includes('mtr') || l.includes('gits') || l.includes('oats') || l.includes('flakes')) return 'Instant Food';
    if (l.includes('chocolate') || l.includes('sweet') || l.includes('soan') || l.includes('katli') || l.includes('kinder')) return 'Sweets & Chocolates';
    if (l.includes('ice cream') || l.includes('fries') || l.includes('mccain')) return 'Ice Creams & Frozen Food';
    if (l.includes('shampoo') || l.includes('hair')) return 'Hair Care';
    if (l.includes('moisturiser') || l.includes('cream') || l.includes('lotion') || l.includes('face') || l.includes('skin')) return 'Skin & Face';
    if (l.includes('lip') || l.includes('makeup') || l.includes('color pops')) return 'Beauty & Cosmetics';
    if (l.includes('pad') || l.includes('sanitary') || l.includes('whisper')) return 'Feminine Hygiene';
    if (l.includes('cleaner') || l.includes('harpic') || l.includes('savlon') || l.includes('antiseptic') || l.includes('repellent') || l.includes('dishwash')) return 'Cleaners & Repellents';
    if (l.includes('container') || l.includes('cello')) return 'Kitchenware & Appliances';
    if (l.includes('notebook') || l.includes('pen') || l.includes('classmate')) return 'Stationery & Games';
    if (l.includes('earphone') || l.includes('boat') || l.includes('cable') || l.includes('charger')) return 'Electronics & Accessories';
    if (l.includes('dog') || l.includes('cat') || l.includes('pet')) return 'Pet Care';
    if (l.includes('chicken') || l.includes('meat') || l.includes('fish') || l.includes('prawn')) return 'Chicken, Meat & Fish';
    if (l.includes('sauce') || l.includes('chutney') || l.includes('jam') || l.includes('spread')) return 'Sauces & Spreads';
    if (l.includes('rice') || l.includes('dal') || l.includes('atta')) return 'Atta, Rice & Dal';
    if (l.includes('oil') || l.includes('ghee') || l.includes('masala')) return 'Oil, Ghee & Masala';
    if (l.includes('biscuit') || l.includes('cookie') || l.includes('rusk') || l.includes('sourdough')) return 'Bakery & Biscuits';
    if (l.includes('soap') || l.includes('body wash') || l.includes('shower') || l.includes('tissue')) return 'Bath & Body';
    if (l.includes('baby') || l.includes('diaper') || l.includes('wipes')) return 'Baby Care';
    if (l.includes('health') || l.includes('wellness') || l.includes('supplement')) return 'Health & Wellness';
    if (l.includes('home') || l.includes('lifestyle')) return 'Home & Lifestyle';
    return 'AMBIGUOUS (Needs Manual Review)';
  };

  let remappedCount = 0;
  let ambiguousCount = 0;

  console.log('OBSOLETE/OVERLAPPING CATEGORIES:');
  seededCatIds.forEach(id => {
    const cname = catMap[id];
    console.log(`- ${id} (${cname})`);
    const pInCat = prods.filter(p => p.category_id === id);
    if (pInCat.length === 0) {
      console.log(`  (No products attached)`);
    } else {
      pInCat.forEach(p => {
        let dest = findDest(p.name);
        if (dest === 'AMBIGUOUS (Needs Manual Review)') {
            if (p.name.includes('Britannia') || p.name.includes('Harvest') || p.name.includes('Amul')) dest = 'Dairy, Bread & Eggs';
            else if (p.name.includes('Tata') || p.name.includes('Brooke') || p.name.includes('Nescafe') || p.name.includes('Bru')) dest = 'Tea, Coffee & Milk Drinks';
            else if (p.name.includes('MDH') || p.name.includes('Everest')) dest = 'Oil, Ghee & Masala';
            else dest = 'AMBIGUOUS';
        }
        
        if (dest === 'AMBIGUOUS') ambiguousCount++;
        else remappedCount++;
        
        console.log(`  - [${p.id}] ${p.name} -> ${dest}`);
      });
    }
    console.log();
  });

  console.log('PRODUCTS THAT REQUIRE REMAPPING:');
  console.log(remappedCount + ambiguousCount);
  console.log('AMBIGUOUS PRODUCTS REQUIRING REVIEW:');
  console.log(ambiguousCount);

})();
