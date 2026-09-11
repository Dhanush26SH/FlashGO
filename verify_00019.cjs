const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const prods = await supabase.from('products').select('*, categories(name)');
  const cats = await supabase.from('categories').select('*');
  
  let invalidCats = prods.data.filter(p => !p.categories);
  
  console.log('PRODUCTS:', prods.data.length);
  console.log('CATEGORIES:', cats.data.length);
  console.log('INVALID CATEGORY REFERENCES:', invalidCats.length);

  const checks = [
    "Knorr Classic Sweet Corn Veg Soup",
    "MTR Ready to Eat Dal Makhani",
    "Harpic Power Plus Toilet Cleaner Original",
    "Lay's Classic Salted Potato Chips",
    "Lay's India's Magic Masala Potato Chips",
    "Kurkure Masala Munch",
    "Kissan Fresh Tomato Ketchup",
    "Veeba Eggless Mayonnaise",
    "Dr. Oetker FunFoods Veg Mayonnaise",
    "Parachute Advansed Coconut Hair Oil",
    "Johnson's Baby Lotion",
    "Himalaya Gentle Baby Shampoo",
    "Nestlé Cerelac Wheat Apple Baby Cereal",
    "Butterfly Premium Vegetable Chopper",
    "Prestige Omega Deluxe Granite Fry Pan",
    "Cello Max Fresh Container Set",
    "Milton Thermosteel Bottle",
    "Seer Fish Steaks",
    "Kwality Wall's Cornetto Double Chocolate",
    "Duracell Alkaline AA Batteries",
    "Eveready AAA Batteries"
  ];

  let failed = 0;
  console.log('\nSEMANTIC CHECKS:');
  checks.forEach(name => {
    const p = prods.data.find(x => x.name === name);
    if (p) {
      console.log(`- ${name} -> ${p.categories.name}`);
    } else {
      console.log(`- ${name} -> NOT FOUND`);
      failed++;
    }
  });
  
  if (failed > 0) {
    console.log('SEMANTIC CHECKS: FAIL');
  } else {
    console.log('SEMANTIC CHECKS: PASS');
  }
}

run();
