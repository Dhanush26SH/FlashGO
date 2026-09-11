const fs = require('fs');

const products = JSON.parse(fs.readFileSync('remote_products.json', 'utf-8'));
const categories = JSON.parse(fs.readFileSync('remote_categories.json', 'utf-8'));
const catId = (name) => { const c = categories.find(c => c.name === name); if(!c) throw new Error("Cat not found: "+name); return c.id; };

const classification = {
  "24 Mantra Organic Brown Rice": "Atta, Rice & Dal",
  "Aashirvaad Shudh Chakki Atta": "Atta, Rice & Dal",
  "Amul Cheese Slices": "Dairy, Bread & Eggs",
  "Amul Chocolate Magic Ice Cream Tub": "Ice Creams & Frozen Food",
  "Amul Gold Full Cream Milk": "Dairy, Bread & Eggs",
  "Amul Kool Kesar (TEST3)": "Tea, Coffee & Milk Drinks",
  "Amul Kool Kesar Flavoured Milk": "Tea, Coffee & Milk Drinks",
  "Amul Pure Ghee": "Oil, Ghee & Masala",
  "Amul Salted Butter": "Dairy, Bread & Eggs",
  "Amul Taaza Toned Milk": "Dairy, Bread & Eggs",
  "Amul Vanilla Magic Ice Cream Tub": "Ice Creams & Frozen Food",
  "Apple Royal Gala": "Vegetables & Fruits",
  "Apsara Platinum Pencils": "Stationery & Games",
  "Ariel Matic Top Load Detergent Powder": "Cleaners & Repellents",
  "Bajaj Majesty DX 11 Dry Iron": "Kitchenware & Appliances",
  "Baked Pita Chips": "Chips & Namkeen",
  "Balaji Simply Salted Wafers": "Chips & Namkeen",
  "Banana Robusta": "Vegetables & Fruits",
  "Bingo! Mad Angles Achaari Masti": "Chips & Namkeen",
  "Bisleri Packaged Drinking Water": "Drinks & Juices",
  "Borosil Glass Mixing Bowl Set": "Kitchenware & Appliances",
  "Britannia 100% Whole Wheat Bread": "Dairy, Bread & Eggs",
  "Britannia Bourbon The Original": "Bakery & Biscuits",
  "Britannia Good Day Cashew Cookies": "Bakery & Biscuits",
  "Britannia Marie Gold Biscuits": "Bakery & Biscuits",
  "Brooke Bond Red Label Tea": "Tea, Coffee & Milk Drinks",
  "Brooke Bond Taj Mahal Tea": "Tea, Coffee & Milk Drinks",
  "Bru Instant Coffee": "Tea, Coffee & Milk Drinks",
  "Butterfly Premium Vegetable Chopper": "Kitchenware & Appliances",
  "Cadbury Bournvita Chocolate Health Drink": "Tea, Coffee & Milk Drinks",
  "Cadbury Dairy Milk Chocolate": "Sweets & Chocolates",
  "Cadbury Dairy Milk Silk Chocolate": "Sweets & Chocolates",
  "Cadbury Oreo Vanilla Creme Biscuits": "Bakery & Biscuits",
  "Camel Oil Pastels": "Stationery & Games",
  "Carrot": "Vegetables & Fruits",
  "Catch Cumin Powder": "Oil, Ghee & Masala",
  "Cello Butterflow Ball Pen Blue": "Stationery & Games",
  "Cello Max Fresh Container Set": "Kitchenware & Appliances",
  "Cello Opalware Dinner Plate Set": "Kitchenware & Appliances",
  "Cetaphil Gentle Skin Cleanser": "Skin & Face",
  "Chicken Breast Boneless": "Chicken, Meat & Fish",
  "Chicken Curry Cut": "Chicken, Meat & Fish",
  "Chicken Drumsticks": "Chicken, Meat & Fish",
  "Ching's Schezwan Chutney": "Sauces & Spreads",
  "Classmate Single Line Notebook": "Stationery & Games",
  "Clinic Plus Strong & Long Shampoo": "Hair Care",
  "Coca-Cola Soft Drink": "Drinks & Juices",
  "Colorbar Perfect Match Primer": "Beauty & Cosmetics",
  "Cucumber": "Vegetables & Fruits",
  "Daawat Rozana Gold Basmati Rice": "Atta, Rice & Dal",
  "Dabur Chyawanprash": "Health & Wellness",
  "Dettol Original Hand Sanitizer": "Health & Wellness",
  "Dettol Original Soap": "Bath & Body",
  "Dhara Kachi Ghani Mustard Oil": "Oil, Ghee & Masala",
  "Dove Cream Beauty Bathing Bar": "Bath & Body",
  "Dove Hair Therapy Breakage Repair Shampoo": "Hair Care",
  "Dr. Oetker FunFoods Veg Mayonnaise": "Sauces & Spreads",
  "Duracell Alkaline AA Batteries": "Home & Lifestyle",
  "Eggs Brown": "Dairy, Bread & Eggs",
  "Electral ORS Powder": "Health & Wellness",
  "Elle 18 Color Pops Matte Lip Color": "Beauty & Cosmetics",
  "Eveready AAA Batteries": "Home & Lifestyle",
  "Everest Red Chilli Powder": "Oil, Ghee & Masala",
  "Everest Turmeric Powder": "Oil, Ghee & Masala",
  "Farm Fresh White Eggs": "Dairy, Bread & Eggs",
  "Ferrero Rocher Chocolate": "Sweets & Chocolates",
  "Fevicol MR White Adhesive": "Stationery & Games",
  "Fiama Gel Bar Celebration Pack": "Bath & Body",
  "Fortune Chakki Fresh Atta": "Atta, Rice & Dal",
  "Fortune Chana Dal": "Atta, Rice & Dal",
  "Fortune Sunlite Refined Sunflower Oil": "Oil, Ghee & Masala",
  "Fresh Hass Avocados": "Vegetables & Fruits",
  "Frooti Mango Drink": "Drinks & Juices",
  "Funskool Business Board Game": "Stationery & Games",
  "Gala No Dust Broom": "Home & Lifestyle",
  "Garnier Bright Complete Vitamin C Face Wash": "Skin & Face",
  "Gits Dosa Mix": "Instant Food",
  "Godrej Aer Pocket Bathroom Fragrance": "Home & Lifestyle",
  "Godrej HIT Crawling Insect Killer Spray": "Cleaners & Repellents",
  "Goodknight Gold Flash Mosquito Repellent Refill": "Cleaners & Repellents",
  "Green Chilli": "Vegetables & Fruits",
  "Haldiram's Aloo Bhujia": "Chips & Namkeen",
  "Haldiram's Nagpur Khatta Meetha": "Chips & Namkeen",
  "Haldiram's Soan Papdi": "Sweets & Chocolates",
  "Harpic Power Plus Toilet Cleaner Original": "Cleaners & Repellents",
  "Harvest Gold White Bread": "Dairy, Bread & Eggs",
  "Head & Shoulders Anti-Dandruff Shampoo": "Hair Care",
  "Hershey's Chocolate Syrup": "Sauces & Spreads",
  "Hershey's Milkshake Chocolate": "Tea, Coffee & Milk Drinks",
  "Himalaya Ashvagandha Tablets": "Health & Wellness",
  "Himalaya Gentle Baby Shampoo": "Baby Care",
  "Himalaya Purifying Neem Face Wash": "Skin & Face",
  "Huggies Complete Comfort Wonder Pants Medium": "Baby Care",
  "ITC Master Chef Crispy Chicken Fries": "Ice Creams & Frozen Food",
  "India Gate Basmati Rice Feast Rozzana": "Atta, Rice & Dal",
  "Johnson's Baby Lotion": "Baby Care",
  "Johnson's Baby Powder": "Baby Care",
  "Kaju Katli Indian Sweet": "Sweets & Chocolates",
  "Kellogg's Corn Flakes Original": "Instant Food",
  "Kinder Joy Chocolate for Boys": "Sweets & Chocolates",
  "Kissan Fresh Tomato Ketchup": "Sauces & Spreads",
  "Kissan Mixed Fruit Jam": "Sauces & Spreads",
  "Knorr Classic Sweet Corn Veg Soup": "Instant Food",
  "Kurkure Masala Munch": "Chips & Namkeen",
  "Kwality Wall's Cornetto Double Chocolate": "Ice Creams & Frozen Food",
  "L'Oréal Paris Total Repair 5 Conditioner": "Hair Care",
  "Lakmé 9 to 5 Primer + Matte Lip Color": "Beauty & Cosmetics",
  "Lakmé Eyeconic Kajal Deep Black": "Beauty & Cosmetics",
  "Lakmé Sun Expert SPF 50 PA+++ Sunscreen": "Skin & Face",
  "Lay's Classic Salted Potato Chips": "Chips & Namkeen",
  "Lay's India's Magic Masala Potato Chips": "Chips & Namkeen",
  "Livon Hair Serum": "Hair Care",
  "Lizol Citrus Disinfectant Surface Cleaner": "Cleaners & Repellents",
  "Lux Soft Touch Soap": "Bath & Body",
  "MDH Garam Masala": "Oil, Ghee & Masala",
  "MTR Instant Rava Idli Mix": "Instant Food",
  "MTR Ready to Eat Dal Makhani": "Instant Food",
  "Maaza Mango Drink": "Drinks & Juices",
  "Maggi 2-Minute Masala Noodles": "Instant Food",
  "Magnum Chocolate Truffle Ice Cream Stick": "Ice Creams & Frozen Food",
  "Mamaearth Ubtan Face Wash": "Skin & Face",
  "Maybelline New York Colossal Kajal": "Beauty & Cosmetics",
  "Maybelline New York Fit Me Matte + Poreless Foundation": "Beauty & Cosmetics",
  "McCain French Fries": "Ice Creams & Frozen Food",
  "McCain Smiles": "Ice Creams & Frozen Food",
  "Mee Mee Baby Wet Wipes": "Baby Care",
  "Microfiber Cleaning Cloth": "Home & Lifestyle",
  "Milton Thermosteel Bottle": "Kitchenware & Appliances",
  "Modern Multigrain Bread": "Dairy, Bread & Eggs",
  "Mother Dairy Paneer": "Dairy, Bread & Eggs",
  "Mutton Curry Cut": "Chicken, Meat & Fish",
  "Nescafé Classic Instant Coffee": "Tea, Coffee & Milk Drinks",
  "Nestlé Cerelac Wheat Apple Baby Cereal": "Baby Care",
  "Nestlé KitKat 4 Finger": "Sweets & Chocolates",
  "Nestlé a+ Slim Milk": "Dairy, Bread & Eggs",
  "Nivea Men Deep Impact Body Wash": "Bath & Body",
  "Nivea Soft Light Moisturiser": "Skin & Face",
  "Nua Ultra-Safe Sanitary Pads": "Feminine Hygiene",
  "Nutella Hazelnut Cocoa Spread": "Sauces & Spreads",
  "Odonil Bathroom Air Freshener Blocks": "Home & Lifestyle",
  "Onion": "Vegetables & Fruits",
  "Pampers All-Round Protection Pants Large": "Baby Care",
  "Pantene Advanced Hairfall Solution Shampoo": "Hair Care",
  "Parachute Advansed Coconut Hair Oil": "Hair Care",
  "Parle-G Original Glucose Biscuits": "Bakery & Biscuits",
  "Pears Pure & Gentle Bathing Bar": "Bath & Body",
  "Pee Safe Menstrual Cup Medium": "Feminine Hygiene",
  "Pepsi Soft Drink": "Drinks & Juices",
  "Philips LED Bulb 9W": "Electronics & Accessories",
  "Pigeon Favourite Electric Kettle": "Kitchenware & Appliances",
  "Pomegranate": "Vegetables & Fruits",
  "Pond's Super Light Gel": "Skin & Face",
  "Portronics Konnect L USB Type-C Cable": "Electronics & Accessories",
  "Potato": "Vegetables & Fruits",
  "Prawns Cleaned": "Chicken, Meat & Fish",
  "Prestige Omega Deluxe Granite Fry Pan": "Kitchenware & Appliances",
  "Prestige Popular Aluminium Pressure Cooker": "Kitchenware & Appliances",
  "Quaker Oats": "Instant Food",
  "Real Fruit Power Mixed Fruit Juice": "Drinks & Juices",
  "Rohu Fish Curry Cut": "Chicken, Meat & Fish",
  "Safal Frozen Green Peas": "Ice Creams & Frozen Food",
  "Saffola Gold Edible Oil": "Oil, Ghee & Masala",
  "Savlon Antiseptic Liquid": "Cleaners & Repellents",
  "Scotch-Brite Scrub Pad": "Home & Lifestyle",
  "Seer Fish Steaks": "Chicken, Meat & Fish",
  "Sirona Premium Applicator Tampons Regular": "Feminine Hygiene",
  "Snickers Chocolate Bar": "Sweets & Chocolates",
  "Sofy Antibacteria Extra Long Pads": "Feminine Hygiene",
  "Sprite Lemon-Lime Soft Drink": "Drinks & Juices",
  "Stayfree Secure XL Cottony Soft Pads": "Feminine Hygiene",
  "Sundrop Peanut Butter Creamy": "Sauces & Spreads",
  "Sunfeast Dark Fantasy Choco Fills": "Bakery & Biscuits",
  "Sunfeast YiPPee! Magic Masala Noodles": "Instant Food",
  "Surf Excel Matic Front Load Detergent Powder": "Cleaners & Repellents",
  "Swiss Beauty Liquid Concealer": "Beauty & Cosmetics",
  "Syska Power Bank P1001": "Electronics & Accessories",
  "Tata Salt Iodised": "Oil, Ghee & Masala",
  "Tata Sampann Masoor Dal": "Atta, Rice & Dal",
  "Tata Sampann Moong Dal": "Atta, Rice & Dal",
  "Tata Sampann Toor Dal": "Atta, Rice & Dal",
  "Tata Tea Premium": "Tea, Coffee & Milk Drinks",
  "Thums Up Soft Drink": "Drinks & Juices",
  "Tomato Hybrid": "Vegetables & Fruits",
  "Too Yumm! Multigrain Chips": "Chips & Namkeen",
  "Tropicana 100% Orange Juice": "Drinks & Juices",
  "UNO Playing Cards": "Stationery & Games",
  "Unibic Choco Chip Cookies": "Bakery & Biscuits",
  "Vaseline Intensive Care Deep Moisture Lotion": "Skin & Face",
  "Veeba Eggless Mayonnaise": "Sauces & Spreads",
  "Vicks VapoRub": "Health & Wellness",
  "Vim Dishwash Gel Lemon": "Cleaners & Repellents",
  "Volini Pain Relief Spray": "Health & Wellness",
  "Whisper Choice Ultra Sanitary Pads": "Feminine Hygiene",
  "Whisper Ultra Clean XL+ Sanitary Pads": "Feminine Hygiene",
  "boAt BassHeads 100 Wired Earphones": "Electronics & Accessories"
};

let correctCount = 0;
let wrongCount = 0;
let wrongProductsList = [];
let outputList = [];

products.forEach(p => {
  const currentCategory = p.categories.name;
  const expectedCategory = classification[p.name];
  
  if (!expectedCategory) {
    console.error("MISSING CLASSIFICATION FOR: " + p.name);
    process.exit(1);
  }
  
  if (currentCategory === expectedCategory) {
    correctCount++;
    outputList.push(`product_id: ${p.id}
sku: ${p.sku}
product_name: ${p.name}
current_category: ${currentCategory}
reviewed_expected_category: ${expectedCategory}
status: CORRECT
reason: Meaning accurately matches the category.
`);
  } else {
    wrongCount++;
    wrongProductsList.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      current: currentCategory,
      expected: expectedCategory
    });
    outputList.push(`product_id: ${p.id}
sku: ${p.sku}
product_name: ${p.name}
current_category: ${currentCategory}
reviewed_expected_category: ${expectedCategory}
status: WRONG
reason: Product meaning matches '${expectedCategory}', not '${currentCategory}'.
`);
  }
});

fs.writeFileSync('audit_output.txt', outputList.join('\n'));

// Generate SQL 00019
let sql = [];
sql.push(`-- 20260904000019_final_semantic_category_corrections.sql`);
sql.push(`-- Generated after explicit semantic review of all 209 products.`);
sql.push(`-- Target: szpfuommfvrfdliloxcg`);
sql.push(``);
sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`    prod_count int;`);
sql.push(`    wh_count int;`);
sql.push(`    wh_sum int;`);
sql.push(`    pb_count int;`);
sql.push(`    pb_sum int;`);
sql.push(`    ir_count int;`);
sql.push(`    ir_sum int;`);
sql.push(`    sl_count int;`);
sql.push(`    cat_count int;`);
sql.push(`BEGIN`);
sql.push(`    SELECT count(*) INTO prod_count FROM public.products;`);
sql.push(`    IF prod_count != 209 THEN RAISE EXCEPTION 'Products count != 209 (found %)', prod_count; END IF;`);
sql.push(``);
sql.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;`);
sql.push(`    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;`);
sql.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;`);
sql.push(`    SELECT count(*) INTO sl_count FROM public.stock_ledgers;`);
sql.push(`    SELECT count(*) INTO cat_count FROM public.categories;`);
sql.push(`    IF cat_count != 26 THEN RAISE EXCEPTION 'Categories count != 26 (found %)', cat_count; END IF;`);
sql.push(``);
sql.push(`    CREATE TEMP TABLE migration_stats AS`);
sql.push(`    SELECT wh_count as wc, wh_sum as ws, pb_count as pc, pb_sum as ps, ir_count as ic, ir_sum as isum, sl_count as sc;`);
sql.push(`END $$;`);
sql.push(``);

wrongProductsList.forEach(w => {
  const newCatId = catId(w.expected);
  sql.push(`UPDATE public.products SET category_id = '${newCatId}' WHERE id = '${w.id}';`);
});

sql.push(``);
sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`    wh_count int;`);
sql.push(`    wh_sum int;`);
sql.push(`    pb_count int;`);
sql.push(`    pb_sum int;`);
sql.push(`    ir_count int;`);
sql.push(`    ir_sum int;`);
sql.push(`    sl_count int;`);
sql.push(`    stats RECORD;`);
sql.push(`BEGIN`);
sql.push(`    SELECT * INTO stats FROM migration_stats;`);
sql.push(``);
sql.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;`);
sql.push(`    IF wh_count != stats.wc OR wh_sum != stats.ws THEN RAISE EXCEPTION 'warehouse_stock mutated'; END IF;`);
sql.push(``);
sql.push(`    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;`);
sql.push(`    IF pb_count != stats.pc OR pb_sum != stats.ps THEN RAISE EXCEPTION 'product_batches mutated'; END IF;`);
sql.push(``);
sql.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;`);
sql.push(`    IF ir_count != stats.ic OR ir_sum != stats.isum THEN RAISE EXCEPTION 'inventory_reservations mutated'; END IF;`);
sql.push(``);
sql.push(`    SELECT count(*) INTO sl_count FROM public.stock_ledgers;`);
sql.push(`    IF sl_count != stats.sc THEN RAISE EXCEPTION 'stock_ledgers mutated'; END IF;`);
sql.push(``);
sql.push(`    DROP TABLE migration_stats;`);
sql.push(`END $$;`);
sql.push(``);

fs.writeFileSync('supabase/migrations/20260904000019_final_semantic_category_corrections.sql', sql.join('\n'));
fs.writeFileSync('wrong_products_list.json', JSON.stringify(wrongProductsList, null, 2));

console.log(`TOTAL AUDITED: ${products.length}`);
console.log(`CORRECT: ${correctCount}`);
console.log(`WRONG: ${wrongCount}`);
