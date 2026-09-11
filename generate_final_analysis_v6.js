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

  const { data: prods } = await supabase.from('products').select('*');

  const getTargetCategory = (name) => {
    const l = name.toLowerCase();
    if (l.includes('real fruit power')) return 'Drinks & Juices';
    if (l.includes('prawns cleaned')) return 'Chicken, Meat & Fish';
    if (l.includes('harpic power plus')) return 'Cleaners & Repellents';
    if (l.includes('savlon antiseptic')) return 'Cleaners & Repellents';
    if (l.includes('ariel matic')) return 'Cleaners & Repellents';
    if (l.includes('vim dishwash')) return 'Cleaners & Repellents';
    if (l.includes('maggi 2-minute')) return 'Instant Food';
    if (l.includes('sunfeast yippee! magic masala')) return 'Instant Food';
    if (l.includes('knorr classic sweet corn')) return 'Instant Food';
    if (l.includes('mtr ready to eat dal makhani')) return 'Instant Food';
    if (l.includes('mtr instant rava idli')) return 'Instant Food';
    if (l.includes('gits dosa mix')) return 'Instant Food';
    if (l.includes("kellogg's corn flakes")) return 'Instant Food';
    if (l.includes('quaker oats')) return 'Instant Food';
    if (l.includes('tata salt')) return 'Oil, Ghee & Masala';
    if (l.includes('amul pure ghee')) return 'Oil, Ghee & Masala';
    if (l.includes('everest turmeric powder')) return 'Oil, Ghee & Masala';
    if (l.includes('everest kashmiri lal mirch')) return 'Oil, Ghee & Masala';
    if (l.includes('catch coriander powder')) return 'Oil, Ghee & Masala';
    if (l.includes('mdh garam masala')) return 'Oil, Ghee & Masala';
    if (l.includes('madhur pure & hygienic sugar')) return 'Oil, Ghee & Masala';
    if (l.includes('fortune sunlite refined sunflower')) return 'Oil, Ghee & Masala';
    if (l.includes('aashirvaad whole wheat atta')) return 'Atta, Rice & Dal';
    if (l.includes('india gate basmati rice')) return 'Atta, Rice & Dal';
    if (l.includes('tata sampann toor dal')) return 'Atta, Rice & Dal';
    if (l.includes('24 mantra organic brown rice')) return 'Atta, Rice & Dal';
    if (l.includes('dettol original hand sanitizer')) return 'Health & Wellness';
    
    // Beverages & Juices
    if (l.includes('coca-cola') || l.includes('pepsi') || l.includes('sprite') || l.includes('thums up')) return 'Drinks & Juices';
    if (l.includes('tropicana') || l.includes('maaza') || l.includes('frooti') || l.includes('bisleri')) return 'Drinks & Juices';
    
    // Tea & Coffee
    if (l.includes('tata tea') || l.includes('brooke bond') || l.includes('nescafé') || l.includes('bru instant') || l.includes('amul kool') || l.includes("hershey's milkshake") || l.includes('bournvita')) return 'Tea, Coffee & Milk Drinks';
    
    // Sweets & Chocolates
    if (l.includes('dairy milk') || l.includes('kitkat') || l.includes('ferrero rocher') || l.includes('snickers') || l.includes('soan papdi') || l.includes('kaju katli') || l.includes('kinder joy')) return 'Sweets & Chocolates';
    
    // Ice Creams & Frozen
    if (l.includes('magic ice cream') || l.includes('cornetto') || l.includes('truffle ice cream') || l.includes('french fries')) return 'Ice Creams & Frozen Food';
    
    // Sauces & Spreads
    if (l.includes('maggi rich tomato ketchup') || l.includes('kissan mixed fruit jam') || l.includes('nutella') || l.includes('funfoods eggless mayonnaise') || l.includes('sundrop peanut butter')) return 'Sauces & Spreads';

    // Chips & Namkeen
    if (l.includes('lays') || l.includes('kurkure') || l.includes('doritos') || l.includes("haldiram's bhujia") || l.includes('too yumm!') || l.includes('pita chips')) return 'Chips & Namkeen';

    // Bakery
    if (l.includes('parle-g') || l.includes('good day') || l.includes('dark fantasy') || l.includes('oreo') || l.includes('nutrichoice digestive')) return 'Bakery & Biscuits';
    
    // Personal Care
    if (l.includes('dove hair therapy')) return 'Hair Care';
    if (l.includes('nivea soft') || l.includes('himalaya purifying neem') || l.includes('vaseline')) return 'Skin & Face';
    if (l.includes('elle 18') || l.includes('lakmé 9 to 5')) return 'Beauty & Cosmetics';
    if (l.includes('whisper choice') || l.includes('nua ultra-safe') || l.includes('menstrual cup')) return 'Feminine Hygiene';
    if (l.includes('nestlé cerelac')) return 'Baby Care';
    
    // Household items
    if (l.includes('gala no dust broom')) return 'Home & Lifestyle';
    if (l.includes('cello opalware dinner') || l.includes('cello max fresh') || l.includes('milton thermosteel') || l.includes('prestige omega')) return 'Kitchenware & Appliances';
    if (l.includes('classmate single line')) return 'Stationery & Games';
    if (l.includes('duracell alkaline') || l.includes('philips led bulb') || l.includes('boat bassheads')) return 'Electronics & Accessories';

    // Fallbacks
    if (l.includes('seer fish')) return 'Chicken, Meat & Fish';
    if (l.includes('chutney')) return 'Sauces & Spreads';
    if (l.includes('onion') || l.includes('potato') || l.includes('tomato') || l.includes('banana') || l.includes('apple') || l.includes('pomegranate') || l.includes('avocado') || l.includes('carrot') || l.includes('cucumber') || l.includes('chilli')) return 'Vegetables & Fruits';
    if (l.includes('milk') || l.includes('cheese') || l.includes('paneer') || l.includes('bread') || l.includes('eggs')) return 'Dairy, Bread & Eggs';

    return 'Home & Lifestyle'; 
  };

  let requiresUpdate = [];
  prods.forEach(p => {
    let destName = getTargetCategory(p.name);
    let destId = catNameToId[destName];
    if (p.category_id !== destId) {
      requiresUpdate.push({ id: p.id, destId });
    }
  });

  let sql = "-- 20260904000008_category_consolidation_v3.sql\\n\\n" +
"BEGIN ISOLATION LEVEL REPEATABLE READ;\\n\\n" +
"-- [A] INVENTORY BASELINE ASSERTIONS (BEFORE)\\n" +
"DO $$ \\n" +
"DECLARE\\n" +
"  ws_count INT;\\n" +
"  sl_count INT;\\n" +
"  pb_count INT;\\n" +
"  ws_qty INT;\\n" +
"  pb_qty INT;\\n" +
"  res_count INT;\\n" +
"  res_qty INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO ws_count, ws_qty FROM warehouse_stock;\\n" +
"  SELECT count(*) INTO sl_count FROM stock_ledgers;\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO pb_count, pb_qty FROM product_batches;\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO res_count, res_qty FROM inventory_reservations;\\n" +
"  \\n" +
"  CREATE TEMP TABLE _inventory_baselines (\\n" +
"    metric VARCHAR,\\n" +
"    val INT\\n" +
"  );\\n" +
"  INSERT INTO _inventory_baselines VALUES \\n" +
"    ('ws_count', ws_count),\\n" +
"    ('ws_qty', ws_qty),\\n" +
"    ('sl_count', sl_count),\\n" +
"    ('pb_count', pb_count),\\n" +
"    ('pb_qty', pb_qty),\\n" +
"    ('res_count', res_count),\\n" +
"    ('res_qty', res_qty);\\n" +
"END $$;\\n\\n" +
"-- [B] CREATE TEMP MAPPING TABLE\\n" +
"CREATE TEMP TABLE _category_mapping (\\n" +
"  product_id UUID,\\n" +
"  destination_category_id UUID\\n" +
");\\n\\n" +
"INSERT INTO _category_mapping (product_id, destination_category_id) VALUES\\n";

  const rows = requiresUpdate.map(p => "  ('" + p.id + "', '" + p.destId + "')");
  sql += rows.join(",\\n") + ";\\n\\n";

  sql += "-- [C] ASSERT MAPPING TABLE ROW COUNTS AND FOREIGN KEYS\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  map_count INT;\\n" +
"  prod_match_count INT;\\n" +
"  distinct_prod_count INT;\\n" +
"  invalid_cat_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO map_count FROM _category_mapping;\\n" +
"  IF map_count != " + requiresUpdate.length + " THEN\\n" +
"    RAISE EXCEPTION 'Expected " + requiresUpdate.length + " mapping rows, got %', map_count;\\n" +
"  END IF;\\n" +
"  \\n" +
"  SELECT count(*) INTO prod_match_count FROM _category_mapping m JOIN products p ON m.product_id = p.id;\\n" +
"  IF prod_match_count != " + requiresUpdate.length + " THEN\\n" +
"    RAISE EXCEPTION 'Expected " + requiresUpdate.length + " matched products, got %', prod_match_count;\\n" +
"  END IF;\\n" +
"  \\n" +
"  SELECT count(distinct product_id) INTO distinct_prod_count FROM _category_mapping;\\n" +
"  IF distinct_prod_count != " + requiresUpdate.length + " THEN\\n" +
"    RAISE EXCEPTION 'Expected " + requiresUpdate.length + " distinct products, got %', distinct_prod_count;\\n" +
"  END IF;\\n" +
"  \\n" +
"  SELECT count(*) INTO invalid_cat_count FROM _category_mapping m LEFT JOIN categories c ON m.destination_category_id = c.id WHERE c.id IS NULL;\\n" +
"  IF invalid_cat_count > 0 THEN\\n" +
"    RAISE EXCEPTION 'Found % invalid destination category IDs', invalid_cat_count;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [D] RENAME CATEGORY AND ASSERT\\n" +
"UPDATE categories \\n" +
"SET name = 'Vegetables & Fruits' \\n" +
"WHERE name = 'Fruits & Vegetables' AND id = 'c0000000-0000-0000-0000-000000000001';\\n\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  veg_count INT;\\n" +
"  fruit_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO veg_count FROM categories WHERE name = 'Vegetables & Fruits';\\n" +
"  SELECT count(*) INTO fruit_count FROM categories WHERE name = 'Fruits & Vegetables';\\n" +
"  IF veg_count != 1 THEN\\n" +
"    RAISE EXCEPTION 'Expected exactly 1 Vegetables & Fruits category, got %', veg_count;\\n" +
"  END IF;\\n" +
"  IF fruit_count != 0 THEN\\n" +
"    RAISE EXCEPTION 'Expected 0 Fruits & Vegetables categories, got %', fruit_count;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [E] APPLY UPDATE FROM TEMP MAPPING\\n" +
"UPDATE products p\\n" +
"SET category_id = m.destination_category_id\\n" +
"FROM _category_mapping m\\n" +
"WHERE p.id = m.product_id;\\n\\n" +
"-- [F] ASSERT POST-UPDATE MATCH\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  mismatch_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO mismatch_count FROM _category_mapping m JOIN products p ON m.product_id = p.id WHERE p.category_id != m.destination_category_id;\\n" +
"  IF mismatch_count > 0 THEN\\n" +
"    RAISE EXCEPTION '% products failed to update to intended category', mismatch_count;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [G] ZERO PRODUCTS REFERENCE OBSOLETE CATEGORIES\\n" +
"DO $$ \\n" +
"DECLARE \\n" +
"  obsolete_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO obsolete_count FROM products WHERE category_id IN (\\n" +
"    'c0000000-0000-0000-0000-000000000003',\\n" +
"    'c0000000-0000-0000-0000-000000000004',\\n" +
"    'c0000000-0000-0000-0000-000000000005',\\n" +
"    'c0000000-0000-0000-0000-000000000006'\\n" +
"  );\\n" +
"  IF obsolete_count > 0 THEN\\n" +
"    RAISE EXCEPTION 'Products still reference obsolete categories';\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [H] DELETE OBSOLETE CATEGORIES AND ASSERT\\n" +
"DELETE FROM categories WHERE id IN (\\n" +
"  'c0000000-0000-0000-0000-000000000003',\\n" +
"  'c0000000-0000-0000-0000-000000000004',\\n" +
"  'c0000000-0000-0000-0000-000000000005',\\n" +
"  'c0000000-0000-0000-0000-000000000006'\\n" +
");\\n\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  obs_cat_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO obs_cat_count FROM categories WHERE id IN (\\n" +
"    'c0000000-0000-0000-0000-000000000003',\\n" +
"    'c0000000-0000-0000-0000-000000000004',\\n" +
"    'c0000000-0000-0000-0000-000000000005',\\n" +
"    'c0000000-0000-0000-0000-000000000006'\\n" +
"  );\\n" +
"  IF obs_cat_count > 0 THEN\\n" +
"    RAISE EXCEPTION 'Failed to delete % obsolete categories', obs_cat_count;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [I] EXACT FINAL CATEGORY SET ASSERTION\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  missing_names VARCHAR;\\n" +
"  extra_names VARCHAR;\\n" +
"  distinct_cat_count INT;\\n" +
"BEGIN\\n" +
"  -- Check count\\n" +
"  IF (SELECT count(*) FROM categories) != 26 THEN\\n" +
"    RAISE EXCEPTION 'Expected exactly 26 categories, found %', (SELECT count(*) FROM categories);\\n" +
"  END IF;\\n" +
"  SELECT count(distinct name) INTO distinct_cat_count FROM categories;\\n" +
"  IF distinct_cat_count != 26 THEN\\n" +
"    RAISE EXCEPTION 'Expected 26 distinct category names, got %', distinct_cat_count;\\n" +
"  END IF;\\n" +
"  \\n" +
"  SELECT string_agg(name, ', ') INTO missing_names FROM (\\n" +
"    VALUES ('Vegetables & Fruits'), ('Dairy, Bread & Eggs'), ('Atta, Rice & Dal'), ('Oil, Ghee & Masala'), ('Bakery & Biscuits'), ('Chips & Namkeen'), ('Drinks & Juices'), ('Tea, Coffee & Milk Drinks'), ('Instant Food'), ('Sweets & Chocolates'), ('Ice Creams & Frozen Food'), ('Sauces & Spreads'), ('Chicken, Meat & Fish'), ('Bath & Body'), ('Hair Care'), ('Skin & Face'), ('Beauty & Cosmetics'), ('Feminine Hygiene'), ('Baby Care'), ('Health & Wellness'), ('Cleaners & Repellents'), ('Home & Lifestyle'), ('Kitchenware & Appliances'), ('Stationery & Games'), ('Electronics & Accessories'), ('Pet Care')\\n" +
"  ) AS expected(name)\\n" +
"  WHERE name NOT IN (SELECT name FROM categories);\\n" +
"  \\n" +
"  IF missing_names IS NOT NULL THEN\\n" +
"    RAISE EXCEPTION 'Missing expected categories: %', missing_names;\\n" +
"  END IF;\\n" +
"  \\n" +
"  SELECT string_agg(name, ', ') INTO extra_names FROM categories \\n" +
"    WHERE name NOT IN ('Vegetables & Fruits', 'Dairy, Bread & Eggs', 'Atta, Rice & Dal', 'Oil, Ghee & Masala', 'Bakery & Biscuits', 'Chips & Namkeen', 'Drinks & Juices', 'Tea, Coffee & Milk Drinks', 'Instant Food', 'Sweets & Chocolates', 'Ice Creams & Frozen Food', 'Sauces & Spreads', 'Chicken, Meat & Fish', 'Bath & Body', 'Hair Care', 'Skin & Face', 'Beauty & Cosmetics', 'Feminine Hygiene', 'Baby Care', 'Health & Wellness', 'Cleaners & Repellents', 'Home & Lifestyle', 'Kitchenware & Appliances', 'Stationery & Games', 'Electronics & Accessories', 'Pet Care');\\n" +
"  IF extra_names IS NOT NULL THEN\\n" +
"    RAISE EXCEPTION 'Found unexpected categories: %', extra_names;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [J] EXACT PRODUCT COUNT ASSERTION (NO SKUs DELETED)\\n" +
"DO $$\\n" +
"DECLARE\\n" +
"  prod_count INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*) INTO prod_count FROM products;\\n" +
"  IF prod_count != 209 THEN\\n" +
"    RAISE EXCEPTION 'Expected 209 products, got %', prod_count;\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"-- [K] INVENTORY BASELINE ASSERTIONS (AFTER)\\n" +
"DO $$ \\n" +
"DECLARE\\n" +
"  ws_count INT;\\n" +
"  sl_count INT;\\n" +
"  pb_count INT;\\n" +
"  ws_qty INT;\\n" +
"  pb_qty INT;\\n" +
"  res_count INT;\\n" +
"  res_qty INT;\\n" +
"BEGIN\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO ws_count, ws_qty FROM warehouse_stock;\\n" +
"  SELECT count(*) INTO sl_count FROM stock_ledgers;\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO pb_count, pb_qty FROM product_batches;\\n" +
"  SELECT count(*), coalesce(sum(quantity), 0) INTO res_count, res_qty FROM inventory_reservations;\\n" +
"  \\n" +
"  IF ws_count != (SELECT val FROM _inventory_baselines WHERE metric = 'ws_count') THEN\\n" +
"    RAISE EXCEPTION 'warehouse_stock row count changed during migration';\\n" +
"  END IF;\\n" +
"  IF ws_qty != (SELECT val FROM _inventory_baselines WHERE metric = 'ws_qty') THEN\\n" +
"    RAISE EXCEPTION 'warehouse_stock quantity sum changed during migration';\\n" +
"  END IF;\\n" +
"  IF sl_count != (SELECT val FROM _inventory_baselines WHERE metric = 'sl_count') THEN\\n" +
"    RAISE EXCEPTION 'stock_ledgers count changed during migration';\\n" +
"  END IF;\\n" +
"  IF pb_count != (SELECT val FROM _inventory_baselines WHERE metric = 'pb_count') THEN\\n" +
"    RAISE EXCEPTION 'product_batches count changed during migration';\\n" +
"  END IF;\\n" +
"  IF pb_qty != (SELECT val FROM _inventory_baselines WHERE metric = 'pb_qty') THEN\\n" +
"    RAISE EXCEPTION 'product_batches quantity sum changed during migration';\\n" +
"  END IF;\\n" +
"  IF res_count != (SELECT val FROM _inventory_baselines WHERE metric = 'res_count') THEN\\n" +
"    RAISE EXCEPTION 'inventory_reservations count changed during migration';\\n" +
"  END IF;\\n" +
"  IF res_qty != (SELECT val FROM _inventory_baselines WHERE metric = 'res_qty') THEN\\n" +
"    RAISE EXCEPTION 'inventory_reservations quantity sum changed during migration';\\n" +
"  END IF;\\n" +
"END $$;\\n\\n" +
"COMMIT;\\n";

  fs.writeFileSync('c:/Users/dhanu/FlashGO/supabase/migrations/20260904000008_category_consolidation_v3.sql', sql);
  console.log("Migration 00008 created successfully.");
})();
