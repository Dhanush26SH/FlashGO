import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  const { data: cats } = await supabase.from('categories').select('*');
  const catNameToId = {};
  cats.forEach(c => catNameToId[c.name] = c.id);
  catNameToId['Vegetables & Fruits'] = catNameToId['Fruits & Vegetables'];

  const obsoleteIds = [
    'c0000000-0000-0000-0000-000000000003', // Snacks & Munchies
    'c0000000-0000-0000-0000-000000000004', // Cold Drinks & Juices
    'c0000000-0000-0000-0000-000000000005', // Household Essentials
    'c0000000-0000-0000-0000-000000000006'  // Personal Care
  ];

  const { data: prods } = await supabase.from('products').select('*');

  const getTargetCategory = (name, originalCatId) => {
    const l = name.toLowerCase();

    if (l.includes('real fruit power')) return 'Drinks & Juices';
    if (l.includes('prawns cleaned')) return 'Chicken, Meat & Fish';
    if (l.includes('harpic power plus')) return 'Cleaners & Repellents';
    if (l.includes('savlon antiseptic')) return 'Cleaners & Repellents';
    if (l.includes('ariel matic')) return 'Cleaners & Repellents';
    if (l.includes('vim dishwash')) return 'Cleaners & Repellents';
    if (l.includes('maggi 2-minute')) return 'Instant Food';
    if (l.includes('knorr classic sweet corn')) return 'Instant Food';
    if (l.includes('mtr ready to eat dal makhani')) return 'Instant Food';
    if (l.includes("ching's schezwan") || l.includes('chings schezwan')) return 'Sauces & Spreads';

    if (!obsoleteIds.includes(originalCatId)) return null;

    if (originalCatId === 'c0000000-0000-0000-0000-000000000003') {
      if (l.includes('dairy milk') || l.includes('kitkat') || l.includes('ferrero rocher') || l.includes('snickers') || l.includes('soan papdi') || l.includes('kaju katli') || l.includes('kinder joy')) return 'Sweets & Chocolates';
      if (l.includes('lays') || l.includes('kurkure') || l.includes('doritos') || l.includes("haldiram's bhujia") || l.includes('too yumm!') || l.includes('pita chips') || l.includes('bingo! mad angles')) return 'Chips & Namkeen';
      if (l.includes('parle-g') || l.includes('good day') || l.includes('dark fantasy') || l.includes('oreo') || l.includes('nutrichoice') || l.includes('marie gold') || l.includes('krackjack')) return 'Bakery & Biscuits';
      if (l.includes('maggi') || l.includes('sunfeast yippee') || l.includes('knorr') || l.includes('mtr') || l.includes('gits') || l.includes('kellogg') || l.includes('quaker') || l.includes('saffola masala oats') || l.includes("haldiram's minute khana") || l.includes('cup noodles')) return 'Instant Food';
      if (l.includes('ketchup') || l.includes('jam') || l.includes('nutella') || l.includes('mayonnaise') || l.includes('peanut butter') || l.includes('chutney') || l.includes('sauce')) return 'Sauces & Spreads';
      return 'Chips & Namkeen'; 
    }

    if (originalCatId === 'c0000000-0000-0000-0000-000000000004') {
      if (l.includes('tata tea') || l.includes('brooke bond') || l.includes('nescafé') || l.includes('bru instant') || l.includes('amul kool') || l.includes("hershey's") || l.includes('bournvita') || l.includes('horlicks') || l.includes('boost') || l.includes('complan') || l.includes('red label') || l.includes('taj mahal') || l.includes('filter coffee') || l.includes('wagh bakri')) return 'Tea, Coffee & Milk Drinks';
      if (l.includes('coca-cola') || l.includes('pepsi') || l.includes('sprite') || l.includes('thums up') || l.includes('tropicana') || l.includes('maaza') || l.includes('frooti') || l.includes('bisleri') || l.includes('red bull') || l.includes('b natural') || l.includes('paper boat') || l.includes('appy fizz')) return 'Drinks & Juices';
      return 'Drinks & Juices'; 
    }

    if (originalCatId === 'c0000000-0000-0000-0000-000000000005') {
      if (l.includes('gala') || l.includes('scotch-brite') || l.includes('lizol') || l.includes('domex') || l.includes('colin') || l.includes('harpic') || l.includes('surf excel') || l.includes('ariel') || l.includes('tide') || l.includes('vim') || l.includes('pril') || l.includes('godrej aer') || l.includes('odonil') || l.includes('all out') || l.includes('good knight') || l.includes('hit') || l.includes('mortein')) return 'Cleaners & Repellents';
      if (l.includes('cello') || l.includes('milton') || l.includes('prestige') || l.includes('tupperware') || l.includes('pigeon') || l.includes('wonderchef') || l.includes('borosil')) return 'Kitchenware & Appliances';
      if (l.includes('classmate') || l.includes('navneet') || l.includes('camlin') || l.includes('apsara') || l.includes('natraj') || l.includes('reynolds') || l.includes('parker')) return 'Stationery & Games';
      if (l.includes('duracell') || l.includes('eveready') || l.includes('philips') || l.includes('boat') || l.includes('jbl') || l.includes('syska')) return 'Electronics & Accessories';
      if (l.includes('pedigree') || l.includes('whiskas') || l.includes('drools') || l.includes('royal canin') || l.includes('meat up')) return 'Pet Care';
      return 'Home & Lifestyle'; 
    }

    if (originalCatId === 'c0000000-0000-0000-0000-000000000006') {
      if (l.includes('dove hair') || l.includes('clinic plus') || l.includes('sunsilk') || l.includes('tresemmé') || l.includes('head & shoulders') || l.includes('pantene') || l.includes("l'oréal") || l.includes('parachute') || l.includes('bajaj almond') || l.includes('vatika')) return 'Hair Care';
      if (l.includes('nivea') || l.includes('himalaya') || l.includes('vaseline') || l.includes("pond's") || l.includes('garnier') || l.includes('olay') || l.includes('lakmé') || l.includes('fair & lovely') || l.includes('glow & lovely') || l.includes('vlcc') || l.includes('biotique')) return 'Skin & Face';
      if (l.includes('elle 18') || l.includes('maybelline') || l.includes('sugar') || l.includes('colorbar') || l.includes('mac') || l.includes('revlon') || l.includes('faces canada')) return 'Beauty & Cosmetics';
      if (l.includes('whisper') || l.includes('stayfree') || l.includes('nua') || l.includes('carmesi') || l.includes('sofy') || l.includes('pee safe') || l.includes('v-wash') || l.includes('everteen')) return 'Feminine Hygiene';
      if (l.includes('pampers') || l.includes('huggies') || l.includes('mamy poko') || l.includes("johnson's baby") || l.includes('sebamed baby') || l.includes('nestlé cerelac') || l.includes('lactogen')) return 'Baby Care';
      if (l.includes('dettol') || l.includes('savlon') || l.includes('volini') || l.includes('moov') || l.includes('zandu') || l.includes('eno') || l.includes('dabur chyawanprash') || l.includes('vicks')) return 'Health & Wellness';
      if (l.includes('dove') || l.includes('pears') || l.includes('lux') || l.includes('lifebuoy') || l.includes('santoor') || l.includes('cinthol') || l.includes('fiama') || l.includes('nivea body') || l.includes('colgate') || l.includes('pepsodent') || l.includes('close-up') || l.includes('sensodyne') || l.includes('oral-b') || l.includes('gillette')) return 'Bath & Body';
      return 'Bath & Body'; 
    }
    return null;
  };

  let requiresUpdate = [];
  prods.forEach(p => {
    let destName = getTargetCategory(p.name, p.category_id);
    if (destName) {
      let destId = catNameToId[destName];
      if (p.category_id !== destId) {
        requiresUpdate.push({ id: p.id, destId });
      }
    }
  });

  let sql = `-- 20260904000017_category_consolidation_v6.sql

-- 1. Rename category
UPDATE categories SET name = 'Vegetables & Fruits' WHERE name = 'Fruits & Vegetables' AND id = 'c0000000-0000-0000-0000-000000000001';

-- 2. Brute force update products
`;
  
  for (const item of requiresUpdate) {
    sql += `UPDATE products SET category_id = '${item.destId}' WHERE id = '${item.id}';\n`;
  }

  sql += `
-- 3. Delete obsolete categories
DELETE FROM categories WHERE id IN (
  'c0000000-0000-0000-0000-000000000003',
  'c0000000-0000-0000-0000-000000000004',
  'c0000000-0000-0000-0000-000000000005',
  'c0000000-0000-0000-0000-000000000006'
);
`;

  fs.writeFileSync('c:/Users/dhanu/FlashGO/supabase/migrations/20260904000017_category_consolidation_v6.sql', sql);
  console.log("Migration 00017 created successfully.");
})();
