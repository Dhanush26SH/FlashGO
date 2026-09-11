import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getExpectedCategory(name) {
  const n = name.toLowerCase();
  
  if (n.includes('carrot') || n.includes('avocado') || n.includes('cucumber') || n.includes('chilli') || n.includes('apple') || n.includes('banana') || n.includes('tomato') || n.includes('potato') || n.includes('onion') || n.includes('pomegranate') || n.includes('veg') || n.includes('fruit') && !n.includes('juice') && !n.includes('jam')) return 'Vegetables & Fruits';
  
  if (n === 'nestlé a+ slim milk' || n === 'amul taaza toned milk' || n === 'amul gold full cream milk' || n.includes('egg') || n.includes('paneer') || n.includes('cheese') || n.includes('butter') && !n.includes('peanut') || n.includes('bread')) return 'Dairy, Bread & Eggs';
  
  if (n.includes('atta') || n.includes('rice') || n.includes('dal') || n.includes('chana') || n.includes('moong')) return 'Atta, Rice & Dal';
  if (n.includes('oil') || n.includes('ghee') || n.includes('masala') || n.includes('salt') || n.includes('powder') && (n.includes('cumin') || n.includes('jeera') || n.includes('dhaniya') || n.includes('chilli') || n.includes('turmeric'))) return 'Oil, Ghee & Masala';
  if (n.includes('biscuit') || n.includes('cookie') || n.includes('rusk') || n.includes('bun') || n.includes('choco fills')) return 'Bakery & Biscuits';
  if (n.includes('chips') || n.includes('namkeen') || n.includes('bhujia') || n.includes('mixture') || n.includes('popcorn') || n.includes('kurkure') || n.includes('doritos') || n.includes('wafers') || n.includes('mad angles')) return 'Chips & Namkeen';
  
  if (n.includes('drink') && !n.includes('health') && !n.includes('milk') || n.includes('juice') || n.includes('water') || n.includes('coke') || n.includes('pepsi') || n.includes('sprite') || n.includes('red bull') || n.includes('slice') || n.includes('thums up') || n.includes('maaza') || n.includes('frooti') || n.includes('bisleri')) return 'Drinks & Juices';
  
  if (n.includes('tea') || n.includes('coffee') || n.includes('milkshake') || n.includes('kool') || n.includes('bournvita') || n.includes('horlicks') || n.includes('complan') || n.includes('health drink')) return 'Tea, Coffee & Milk Drinks';
  
  if (n.includes('noodle') || n.includes('soup') || n.includes('ready to eat') || n.includes('maggi') || n.includes('yippee') || n.includes('mtr') || n.includes('knorr') || n.includes('dosa mix') || n.includes('idli mix') || n.includes('oats') || n.includes('corn flakes')) return 'Instant Food';
  
  if (n.includes('chocolate') && !n.includes('ice cream') && !n.includes('syrup') || n.includes('sweet') || n.includes('kaju') || n.includes('barfi') || n.includes('ladoo') || n.includes('kinder') || n.includes('dairy milk') || n.includes('nutella') || n.includes('soan papdi') || n.includes('rocher') || n.includes('snickers')) return 'Sweets & Chocolates';
  
  if (n.includes('ice cream') || n.includes('frozen') || n.includes('fries') || n.includes('cornetto') || n.includes('magnum') || n.includes('mccain') || n.includes('safal') && n.includes('peas')) return 'Ice Creams & Frozen Food';
  if (n.includes('ketchup') || n.includes('mayonnaise') || n.includes('spread') || n.includes('chutney') || n.includes('jam') || n.includes('sauce') || n.includes('peanut butter') || n.includes('syrup')) return 'Sauces & Spreads';
  if (n.includes('chicken') || n.includes('mutton') || n.includes('fish') || n.includes('prawn') || n.includes('rohu') || n.includes('seer')) return 'Chicken, Meat & Fish';
  if (n.includes('soap') || n.includes('body wash') || n.includes('bathing bar') || n.includes('shower gel') || n.includes('dove') && n.includes('bar') || n.includes('pears') || n.includes('lux') || n.includes('fiama') || n.includes('dettol') && n.includes('soap')) return 'Bath & Body';
  if (n.includes('shampoo') || n.includes('conditioner') || n.includes('hair oil') || n.includes('serum') || n.includes('pantene') || n.includes('head & shoulders') || n.includes('parachute') || n.includes('clinic plus') || n.includes('livon')) return 'Hair Care';
  if (n.includes('face wash') || n.includes('moisturiser') || n.includes('sunscreen') || n.includes('lotion') || n.includes('gel') && n.includes('pond') || n.includes('nivea') && n.includes('soft') || n.includes('cetaphil') || n.includes('himalaya') && (n.includes('neem') || n.includes('face')) || n.includes('ubtan')) return 'Skin & Face';
  if (n.includes('makeup') || n.includes('kajal') || n.includes('lipstick') || n.includes('foundation') || n.includes('primer') || n.includes('concealer') || n.includes('lakmé') || n.includes('maybelline') || n.includes('colorbar') || n.includes('swiss beauty') || n.includes('elle 18') || n.includes('lip color')) return 'Beauty & Cosmetics';
  if (n.includes('pad') || n.includes('tampon') || n.includes('menstrual') || n.includes('whisper') || n.includes('stayfree') || n.includes('sofy') || n.includes('nua') || n.includes('pee safe') || n.includes('sirona')) return 'Feminine Hygiene';
  if (n.includes('baby') || n.includes('pamper') || n.includes('huggie') || n.includes('cerelac') || n.includes('mee mee') || n.includes('johnson')) return 'Baby Care';
  if (n.includes('health') || n.includes('wellness') || n.includes('tablet') || n.includes('vicks') || n.includes('chyawanprash') || n.includes('ashvagandha') || n.includes('volini') || n.includes('electral') || n.includes('sanitizer') || n.includes('antiseptic') && !n.includes('liquid')) return 'Health & Wellness';
  // Specific catch for Savlon Antiseptic Liquid
  if (n.includes('savlon') && n.includes('liquid')) return 'Cleaners & Repellents';
  if (n.includes('savlon') && !n.includes('liquid')) return 'Health & Wellness';

  if (n.includes('detergent') || n.includes('cleaner') || n.includes('repellent') || n.includes('harpic') || n.includes('lizol') || n.includes('ariel') || n.includes('surf excel') || n.includes('vim') || n.includes('goodknight') || n.includes('hit') || n.includes('liquid') && n.includes('savlon') || n.includes('disinfectant')) return 'Cleaners & Repellents';
  if (n.includes('home') || n.includes('utility') || n.includes('broom') || n.includes('cloth') || n.includes('freshener') || n.includes('aer') || n.includes('odonil') || n.includes('scotch-brite') || n.includes('gala') || n.includes('bottle') || n.includes('container') || n.includes('thermosteel')) return 'Home & Lifestyle';
  if (n.includes('cookware') || n.includes('appliance') || n.includes('iron') || n.includes('kettle') || n.includes('chopper') || n.includes('cooker') || n.includes('pan') || n.includes('bowl') || n.includes('plate') || n.includes('prestige') || n.includes('pigeon') || n.includes('butterfly') || n.includes('borosil') || n.includes('cello opalware')) return 'Kitchenware & Appliances';
  if (n.includes('pen') || n.includes('notebook') || n.includes('game') || n.includes('card') || n.includes('pencil') || n.includes('pastel') || n.includes('adhesive') || n.includes('classmate') || n.includes('apsara') || n.includes('camel') || n.includes('fevicol') || n.includes('uno') || n.includes('funskool')) return 'Stationery & Games';
  if (n.includes('electronic') || n.includes('accessory') || n.includes('battery') || n.includes('bulb') || n.includes('cable') || n.includes('power bank') || n.includes('earphone') || n.includes('syska') || n.includes('portronics') || n.includes('boat') || n.includes('philips') || n.includes('duracell') || n.includes('eveready')) return 'Electronics & Accessories';
  
  if (n.includes('pet')) return 'Pet Care';
  
  return 'UNRESOLVED';
}

(async () => {
  const { data: prods } = await supabase.from('products').select('*, categories(name)').order('name');
  let unresolved = [];
  for (const p of prods) {
    if (getExpectedCategory(p.name) === 'UNRESOLVED') unresolved.push(p.name);
  }
  console.log("Unresolved Count:", unresolved.length);
  if (unresolved.length > 0) console.log(unresolved.join('\\n'));
})();
