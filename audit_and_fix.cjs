const fs = require('fs');
const products = JSON.parse(fs.readFileSync('remote_products.json', 'utf-8'));
const categories = JSON.parse(fs.readFileSync('remote_categories.json', 'utf-8'));

// Helper to find category id by name
const catId = (name) => categories.find(c => c.name === name).id;

const exactMap = {
  // Vegetables & Fruits
  "Apple Royal Gala": "Vegetables & Fruits",
  "Banana Robusta": "Vegetables & Fruits",
  "Potato": "Vegetables & Fruits",
  "Tomato Hybrid": "Vegetables & Fruits",
  "Onion": "Vegetables & Fruits",
  "Fresh Hass Avocados": "Vegetables & Fruits",
  "Carrot": "Vegetables & Fruits",
  "Green Chilli": "Vegetables & Fruits",
  "Lemon": "Vegetables & Fruits",
  "Pomegranate": "Vegetables & Fruits",
  "Garlic": "Vegetables & Fruits",
  "Ginger": "Vegetables & Fruits",
  "Cucumber": "Vegetables & Fruits",
  "Capsicum Green": "Vegetables & Fruits",
  "Watermelon Kiran": "Vegetables & Fruits",
  "Mango Alphonso": "Vegetables & Fruits",
  "Papaya": "Vegetables & Fruits",
  "Sweet Corn": "Vegetables & Fruits",
  "Orange Nagpur": "Vegetables & Fruits",
  "Grapes Green": "Vegetables & Fruits",
  "Coconut": "Vegetables & Fruits",
  "Cauliflower": "Vegetables & Fruits",
  "Cabbage": "Vegetables & Fruits",
  "Broccoli": "Vegetables & Fruits",

  // Dairy, Bread & Eggs
  "Amul Taaza Toned Milk": "Dairy, Bread & Eggs",
  "Amul Gold Full Cream Milk": "Dairy, Bread & Eggs",
  "Nestlé a+ Slim Milk": "Dairy, Bread & Eggs",
  "Britannia Cheese Slices": "Dairy, Bread & Eggs",
  "Amul Cheese Cubes": "Dairy, Bread & Eggs",
  "Amul Butter Pasteurized": "Dairy, Bread & Eggs",
  "ID Fresh Batter Idli & Dosa": "Dairy, Bread & Eggs",
  "Modern White Bread": "Dairy, Bread & Eggs",
  "Britannia 100% Whole Wheat Bread": "Dairy, Bread & Eggs",
  "Farm Fresh Classic Eggs - 6 Pack": "Dairy, Bread & Eggs",
  "Godrej Real Good Yolk Eggs - 12 Pack": "Dairy, Bread & Eggs",
  "Amul Fresh Cream": "Dairy, Bread & Eggs",
  "Gowardhan Fresh Paneer": "Dairy, Bread & Eggs",
  "Epigamia Greek Yogurt": "Dairy, Bread & Eggs",

  // Atta, Rice & Dal
  "Aashirvaad Shudh Chakki Atta": "Atta, Rice & Dal",
  "Fortune Chakki Fresh Atta": "Atta, Rice & Dal",
  "India Gate Basmati Rice Classic": "Atta, Rice & Dal",
  "Daawat Rozana Super Basmati Rice": "Atta, Rice & Dal",
  "24 Mantra Organic Brown Rice": "Atta, Rice & Dal",
  "Tata Sampann Toor Dal": "Atta, Rice & Dal",
  "Tata Sampann Moong Dal": "Atta, Rice & Dal",
  "Fortune Chana Dal": "Atta, Rice & Dal",
  "Organic Tattva Urad Dal": "Atta, Rice & Dal",
  "Tata Sampann Masoor Dal": "Atta, Rice & Dal",
  "Rajdhani Besan": "Atta, Rice & Dal",

  // Instant Food
  "Maggi 2-Minute Masala Noodles": "Instant Food",
  "Sunfeast YiPPee! Magic Masala Noodles": "Instant Food",
  "Ching's Secret Hot Garlic Noodles": "Instant Food",
  "Knorr Classic Sweet Corn Veg Soup": "Instant Food",
  "Knorr Hot & Sour Veg Soup": "Instant Food",
  "MTR Ready to Eat Dal Makhani": "Instant Food",
  "MTR Ready to Eat Palak Paneer": "Instant Food",
  "Quaker Oats": "Instant Food",
  "Kellogg's Corn Flakes": "Instant Food",
  "Kellogg's Chocos": "Instant Food",

  // Oil, Ghee & Masala
  "Fortune Sunlite Refined Sunflower Oil": "Oil, Ghee & Masala",
  "Saffola Gold Edible Oil": "Oil, Ghee & Masala",
  "Dhara Mustard Oil": "Oil, Ghee & Masala",
  "Amul Pure Ghee": "Oil, Ghee & Masala",
  "Tata Salt Iodised": "Oil, Ghee & Masala",
  "Catch Turmeric Powder": "Oil, Ghee & Masala",
  "Catch Coriander Powder": "Oil, Ghee & Masala",
  "Everest Garam Masala": "Oil, Ghee & Masala",
  "Everest Chicken Masala": "Oil, Ghee & Masala",
  "MDH Chunky Chat Masala": "Oil, Ghee & Masala",
  "MDH Kashmiri Mirch Powder": "Oil, Ghee & Masala",
  "Aashirvaad Chilli Powder": "Oil, Ghee & Masala",
  "Catch Cumin (Jeera) Whole": "Oil, Ghee & Masala",
  "Organic Tattva Black Pepper Powder": "Oil, Ghee & Masala",
  "Catch Hing (Asafoetida)": "Oil, Ghee & Masala",

  // Tea, Coffee & Milk Drinks
  "Tata Tea Premium": "Tea, Coffee & Milk Drinks",
  "Brooke Bond Red Label Tea": "Tea, Coffee & Milk Drinks",
  "Lipton Green Tea Pure & Light": "Tea, Coffee & Milk Drinks",
  "Taj Mahal Tea": "Tea, Coffee & Milk Drinks",
  "Nescafé Classic Instant Coffee": "Tea, Coffee & Milk Drinks",
  "BRU Instant Coffee": "Tea, Coffee & Milk Drinks",
  "Davidoff Café Espresso 57": "Tea, Coffee & Milk Drinks",
  "Bournvita Health Drink": "Tea, Coffee & Milk Drinks",
  "Horlicks Health Nutrition Drink": "Tea, Coffee & Milk Drinks",
  "Complan Nutrition and Health Drink": "Tea, Coffee & Milk Drinks",
  "Ensure Diabetes Care": "Tea, Coffee & Milk Drinks",

  // Drinks & Juices
  "Coca-Cola Soft Drink": "Drinks & Juices",
  "Pepsi Soft Drink": "Drinks & Juices",
  "Sprite Lemon-Lime Soft Drink": "Drinks & Juices",
  "Thums Up Soft Drink": "Drinks & Juices",
  "Real Fruit Power Mixed Fruit Juice": "Drinks & Juices",
  "Tropicana 100% Orange Juice": "Drinks & Juices",
  "B Natural Guava Juice": "Drinks & Juices",
  "Paper Boat Aamras": "Drinks & Juices",
  "Red Bull Energy Drink": "Drinks & Juices",
  "Monster Energy Drink": "Drinks & Juices",

  // Sauces & Spreads
  "Kissan Fresh Tomato Ketchup": "Sauces & Spreads",
  "Maggi Rich Tomato Ketchup": "Sauces & Spreads",
  "Ching's Schezwan Chutney": "Sauces & Spreads",
  "Veeba Eggless Mayonnaise": "Sauces & Spreads",
  "Pintola All Natural Peanut Butter": "Sauces & Spreads",
  "Sundrop Peanut Butter Creamy": "Sauces & Spreads",
  "Nutella Hazelnut Spread": "Sauces & Spreads",
  "Hershey's Chocolate Syrup": "Sauces & Spreads",

  // Bakery & Biscuits
  "Parle-G Original Glucose Biscuits": "Bakery & Biscuits",
  "Britannia Good Day Cashew Biscuits": "Bakery & Biscuits",
  "Britannia Marie Gold Biscuits": "Bakery & Biscuits",
  "Sunfeast Dark Fantasy Choco Fills": "Bakery & Biscuits",
  "Oreo Vanilla Creme Biscuits": "Bakery & Biscuits",
  "Unibic Choco Chip Cookies": "Bakery & Biscuits",
  "Britannia Bourbon The Original": "Bakery & Biscuits",
  "Cadbury Oreo Dipped Cookies": "Bakery & Biscuits",

  // Sweets & Chocolates
  "Cadbury Dairy Milk Chocolate": "Sweets & Chocolates",
  "Cadbury Dairy Milk Silk": "Sweets & Chocolates",
  "Nestlé KitKat 4 Finger": "Sweets & Chocolates",
  "Ferrero Rocher Chocolates": "Sweets & Chocolates",
  "Snickers Chocolate Bar": "Sweets & Chocolates",
  "Amul Dark Chocolate": "Sweets & Chocolates",
  "Hershey's Kisses Milk Chocolate": "Sweets & Chocolates",
  "Kinder Joy for Boys": "Sweets & Chocolates",
  "Kinder Joy for Girls": "Sweets & Chocolates",
  "Haldiram's Rasgulla": "Sweets & Chocolates",
  "Haldiram's Gulab Jamun": "Sweets & Chocolates",
  "Bikano Soan Papdi": "Sweets & Chocolates",

  // Chips & Namkeen
  "Lay's India's Magic Masala Chips": "Chips & Namkeen",
  "Lay's American Style Cream & Onion": "Chips & Namkeen",
  "Kurkure Masala Munch": "Chips & Namkeen",
  "Bingo! Mad Angles Tomato Madness": "Chips & Namkeen",
  "Doritos Nacho Cheese Tortilla Chips": "Chips & Namkeen",
  "Haldiram's Bhujia Sev": "Chips & Namkeen",
  "Haldiram's Aloo Bhujia": "Chips & Namkeen",
  "Balaji Wafers Simply Salted": "Chips & Namkeen",
  "Too Yumm! Multigrain Chips": "Chips & Namkeen",
  "Pringles Original Potato Crisps": "Chips & Namkeen",
  "ACT II Golden Sizzle Popcorn": "Chips & Namkeen",

  // Ice Creams & Frozen Food
  "Amul Vanilla Magic Ice Cream": "Ice Creams & Frozen Food",
  "Amul Chocolate Magic Ice Cream Tub": "Ice Creams & Frozen Food",
  "Kwality Wall's Cornetto Double Chocolate": "Ice Creams & Frozen Food",
  "Magnum Almond Ice Cream Stick": "Ice Creams & Frozen Food",
  "McCain French Fries": "Ice Creams & Frozen Food",
  "McCain Smiles": "Ice Creams & Frozen Food",
  "Safal Frozen Green Peas": "Ice Creams & Frozen Food",
  "Godrej Yummiez Chicken Nuggets": "Ice Creams & Frozen Food",

  // Chicken, Meat & Fish
  "Chicken Breast Boneless": "Chicken, Meat & Fish",
  "Chicken Curry Cut": "Chicken, Meat & Fish",
  "Chicken Drumsticks": "Chicken, Meat & Fish",
  "Mutton Curry Cut": "Chicken, Meat & Fish",
  "Rohu Fish Curry Cut": "Chicken, Meat & Fish",
  "Seer Fish Steaks": "Chicken, Meat & Fish",
  "Prawns Cleaned": "Chicken, Meat & Fish",

  // Bath & Body
  "Dettol Original Bathing Bar": "Bath & Body",
  "Dove Cream Beauty Bathing Bar": "Bath & Body",
  "Pears Pure & Gentle Bathing Bar": "Bath & Body",
  "Cinthol Cool Bath Soap": "Bath & Body",
  "Nivea Men Body Wash": "Bath & Body",
  "Fiama Di Wills Shower Gel": "Bath & Body",
  "Lifebuoy Total 10 Handwash": "Bath & Body",
  "Godrej Protekt Handwash": "Bath & Body",

  // Hair Care
  "Head & Shoulders Anti Dandruff Shampoo": "Hair Care",
  "Dove Hair Fall Rescue Shampoo": "Hair Care",
  "Sunsilk Stunning Black Shine Shampoo": "Hair Care",
  "Pantene Advanced Hair Fall Solution": "Hair Care",
  "L'Oréal Paris Total Repair 5 Shampoo": "Hair Care",
  "Parachute Advanced Jasmine Hair Oil": "Hair Care",
  "Bajaj Almond Drops Hair Oil": "Hair Care",

  // Skin & Face
  "Garnier Men Power White Face Wash": "Skin & Face",
  "Himalaya Purifying Neem Face Wash": "Skin & Face",
  "Pond's Pure White Face Wash": "Skin & Face",
  "Clean & Clear Foaming Face Wash": "Skin & Face",
  "Lakmé Peach Milk Moisturizer": "Skin & Face",
  "Pond's Super Light Gel": "Skin & Face",
  "Vaseline Intensive Care Deep Moisture Lotion": "Skin & Face",
  "Nivea Soft Light Moisturizer": "Skin & Face",
  "Olay Total Effects 7 in One Day Cream": "Skin & Face",

  // Beauty & Cosmetics
  "Lakmé Eyeconic Kajal": "Beauty & Cosmetics",
  "Maybelline New York Colossal Kajal": "Beauty & Cosmetics",
  "Colorbar Velvet Matte Lipstick": "Beauty & Cosmetics",
  "MAC Matte Lipstick Velvet Teddy": "Beauty & Cosmetics",
  "Lakmé Absolute Blur Perfect Makeup Primer": "Beauty & Cosmetics",
  "Maybelline Fit Me Matte + Poreless Foundation": "Beauty & Cosmetics",
  "Swiss Beauty Liquid Concealer": "Beauty & Cosmetics",
  "SUGAR Cosmetics Matte As Hell Crayon Lipstick": "Beauty & Cosmetics",

  // Feminine Hygiene
  "Whisper Ultra Clean XL+ Sanitary Pads": "Feminine Hygiene",
  "Stayfree Secure XL Cottony Soft Pads": "Feminine Hygiene",
  "Sofy Antibacteria Extra Long Pads": "Feminine Hygiene",
  "Sirona Premium Applicator Tampons Regular": "Feminine Hygiene",
  "Pee Safe Menstrual Cup Medium": "Feminine Hygiene",
  "Everteen Natural Intimate Wash": "Feminine Hygiene",
  "Whisper Choice Ultra Sanitary Pads": "Feminine Hygiene",
  "VWash Plus Expert Intimate Hygiene": "Feminine Hygiene",
  "Carmesi Natural Panty Liners": "Feminine Hygiene",
  "Gillette Venus Smooth Razor for Women": "Feminine Hygiene",

  // Baby Care
  "Pampers Active Baby Taped Diapers": "Baby Care",
  "Huggies Wonder Pants Medium": "Baby Care",
  "Johnson's Baby Soap": "Baby Care",
  "Himalaya Baby Massage Oil": "Baby Care",
  "Sebamed Baby Lotion": "Baby Care",
  "Mee Mee Baby Wipes": "Baby Care",
  "Nestlé Cerelac Wheat Apple": "Baby Care",

  // Health & Wellness
  "Dabur Chyawanprash": "Health & Wellness",
  "Baidyanath Ashwagandha Churna": "Health & Wellness",
  "Zandu Balm": "Health & Wellness",
  "Vicks Action 500 Advanced": "Health & Wellness",
  "Eno Lemon Digestive Antacid": "Health & Wellness",
  "Vicks VapoRub": "Health & Wellness",
  "Volini Pain Relief Spray": "Health & Wellness",
  "Moov Pain Relief Cream": "Health & Wellness",
  "Revital H Daily Health Supplement": "Health & Wellness",

  // Cleaners & Repellents
  "Surf Excel Matic Front Load Detergent Powder": "Cleaners & Repellents",
  "Ariel Matic Top Load Detergent Powder": "Cleaners & Repellents",
  "Vim Dishwash Gel Lemon": "Cleaners & Repellents",
  "Lizol Floral Surface Cleaner": "Cleaners & Repellents",
  "Harpic Power Plus Toilet Cleaner Original": "Cleaners & Repellents",
  "Colin Glass and Surface Cleaner": "Cleaners & Repellents",
  "Comfort Fabric Conditioner Lily Fresh": "Cleaners & Repellents",
  "Good knight Gold Flash Mosquito Repellent Refill": "Cleaners & Repellents",
  "HIT Flying Insect Killer Spray": "Cleaners & Repellents",
  "Odomos Naturals Mosquito Repellent Cream": "Cleaners & Repellents",

  // Home & Lifestyle
  "Godrej aer pocket Bathroom Fragrance": "Home & Lifestyle",
  "Ambi Pur Room Freshener Spray": "Home & Lifestyle",
  "Scotch-Brite Scrub Pad": "Home & Lifestyle",
  "Gala Spin Mop with Bucket": "Home & Lifestyle",
  "Allout Ultra Mosquito Repellent Refill": "Home & Lifestyle",
  "Duracell AA Alkaline Batteries": "Home & Lifestyle",

  // Kitchenware & Appliances
  "Prestige Popular Aluminium Pressure Cooker": "Kitchenware & Appliances",
  "Pigeon Favourite Electric Kettle": "Kitchenware & Appliances",
  "Milton Thermosteel Flip Lid Flask": "Kitchenware & Appliances",
  "Cello Opalware Dinner Set": "Kitchenware & Appliances",
  "Philips HL7756/00 Mixer Grinder": "Kitchenware & Appliances",
  "Bajaj Majesty DX 11 Dry Iron": "Kitchenware & Appliances",
  "Prestige Omega Deluxe Granite Fry Pan": "Kitchenware & Appliances",
  
  // Stationery & Games
  "Classmate Long Notebook": "Stationery & Games",
  "Apsara Platinum Pencils": "Stationery & Games",
  "Cello Gripper Ball Pens": "Stationery & Games",
  "Faber-Castell Wax Crayons": "Stationery & Games",
  "Camel Water Colors": "Stationery & Games",
  "UNO Playing Cards": "Stationery & Games",
  "Funskool Monopoly Board Game": "Stationery & Games",

  // Electronics & Accessories
  "Boat Bassheads 100 Wired Earphones": "Electronics & Accessories",
  "Philips LED Bulb 9W": "Electronics & Accessories",
  "SanDisk Cruzer Blade 32GB USB Flash Drive": "Electronics & Accessories",
  "Portronics Konnect L USB Type-C Cable": "Electronics & Accessories",
  "Syska Power Bank P1001": "Electronics & Accessories",
  "Logitech B170 Wireless Mouse": "Electronics & Accessories",

  // Pet Care
  "Pedigree Adult Dry Dog Food Chicken & Vegetables": "Pet Care",
  "Whiskas Adult Dry Cat Food Ocean Fish": "Pet Care",
  "Drools Chicken and Egg Adult Dog Food": "Pet Care"
};

let correctCount = 0;
let wrongCount = 0;
const wrongProducts = [];
const missing = [];

const auditOutput = [];

products.forEach(p => {
  const currentCat = p.categories.name;
  const expectedCat = exactMap[p.name];
  
  if (!expectedCat) {
    missing.push(p.name);
    return;
  }
  
  let status = 'CORRECT';
  let reason = 'Matches product meaning.';
  
  if (currentCat !== expectedCat) {
    status = 'WRONG';
    reason = `Incorrectly placed in ${currentCat}. Meaning dictates ${expectedCat}.`;
    wrongCount++;
    wrongProducts.push({
      product_id: p.id,
      sku: p.sku,
      product_name: p.name,
      current_category: currentCat,
      correct_category: expectedCat,
      reason: reason
    });
  } else {
    correctCount++;
  }
  
  auditOutput.push(`product_id: ${p.id}
sku: ${p.sku}
product_name: ${p.name}
current_category: ${currentCat}
reviewed_expected_category: ${expectedCat}
status: ${status}
reason: ${reason}
`);
});

if (missing.length > 0) {
  console.log('Missing from exactMap:', missing);
  process.exit(1);
}

fs.writeFileSync('audit_report.txt', auditOutput.join('\n'));

console.log(`Audited: ${products.length}`);
console.log(`Correct: ${correctCount}`);
console.log(`Wrong: ${wrongCount}`);

// Generate SQL
const sqlLines = [];
sqlLines.push(`-- 20260904000019_final_semantic_category_corrections.sql`);
sqlLines.push(`-- Explicit semantic category corrections using remote product and category IDs.`);
sqlLines.push(``);
sqlLines.push(`DO $$`);
sqlLines.push(`DECLARE`);
sqlLines.push(`    prod_count int;`);
sqlLines.push(`    wh_count int;`);
sqlLines.push(`    wh_sum int;`);
sqlLines.push(`    pb_count int;`);
sqlLines.push(`    pb_sum int;`);
sqlLines.push(`    ir_count int;`);
sqlLines.push(`    ir_sum int;`);
sqlLines.push(`    sl_count int;`);
sqlLines.push(`    cat_count int;`);
sqlLines.push(`BEGIN`);
sqlLines.push(`    SELECT count(*) INTO prod_count FROM public.products;`);
sqlLines.push(`    IF prod_count != 209 THEN RAISE EXCEPTION 'Products count != 209 (found %)', prod_count; END IF;`);
sqlLines.push(``);
sqlLines.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;`);
sqlLines.push(`    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;`);
sqlLines.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;`);
sqlLines.push(`    SELECT count(*) INTO sl_count FROM public.stock_ledgers;`);
sqlLines.push(`    SELECT count(*) INTO cat_count FROM public.categories;`);
sqlLines.push(`    IF cat_count != 26 THEN RAISE EXCEPTION 'Categories count != 26 (found %)', cat_count; END IF;`);
sqlLines.push(``);
sqlLines.push(`    CREATE TEMP TABLE migration_stats AS`);
sqlLines.push(`    SELECT wh_count as wc, wh_sum as ws, pb_count as pc, pb_sum as ps, ir_count as ic, ir_sum as isum, sl_count as sc;`);
sqlLines.push(`END $$;`);
sqlLines.push(``);

const updates = wrongProducts.map(wp => {
  const newCatId = catId(wp.correct_category);
  return `UPDATE public.products SET category_id = '${newCatId}' WHERE id = '${wp.product_id}';`;
});

sqlLines.push(...updates);

sqlLines.push(``);
sqlLines.push(`DO $$`);
sqlLines.push(`DECLARE`);
sqlLines.push(`    wh_count int;`);
sqlLines.push(`    wh_sum int;`);
sqlLines.push(`    pb_count int;`);
sqlLines.push(`    pb_sum int;`);
sqlLines.push(`    ir_count int;`);
sqlLines.push(`    ir_sum int;`);
sqlLines.push(`    sl_count int;`);
sqlLines.push(`    stats RECORD;`);
sqlLines.push(`BEGIN`);
sqlLines.push(`    SELECT * INTO stats FROM migration_stats;`);
sqlLines.push(``);
sqlLines.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO wh_count, wh_sum FROM public.warehouse_stock;`);
sqlLines.push(`    IF wh_count != stats.wc OR wh_sum != stats.ws THEN RAISE EXCEPTION 'warehouse_stock mutated'; END IF;`);
sqlLines.push(``);
sqlLines.push(`    SELECT count(*), coalesce(sum(available_quantity), 0) INTO pb_count, pb_sum FROM public.product_batches;`);
sqlLines.push(`    IF pb_count != stats.pc OR pb_sum != stats.ps THEN RAISE EXCEPTION 'product_batches mutated'; END IF;`);
sqlLines.push(``);
sqlLines.push(`    SELECT count(*), coalesce(sum(quantity), 0) INTO ir_count, ir_sum FROM public.inventory_reservations;`);
sqlLines.push(`    IF ir_count != stats.ic OR ir_sum != stats.isum THEN RAISE EXCEPTION 'inventory_reservations mutated'; END IF;`);
sqlLines.push(``);
sqlLines.push(`    SELECT count(*) INTO sl_count FROM public.stock_ledgers;`);
sqlLines.push(`    IF sl_count != stats.sc THEN RAISE EXCEPTION 'stock_ledgers mutated'; END IF;`);
sqlLines.push(``);
sqlLines.push(`    DROP TABLE migration_stats;`);
sqlLines.push(`END $$;`);

fs.writeFileSync('supabase/migrations/20260904000019_final_semantic_category_corrections.sql', sqlLines.join('\n'));
fs.writeFileSync('wrong_products.json', JSON.stringify(wrongProducts, null, 2));

console.log('Generated 20260904000019_final_semantic_category_corrections.sql');
