const fs = require('fs');
const crypto = require('crypto');
const products = JSON.parse(fs.readFileSync('products_dump.json', 'utf8'));

const draft = JSON.parse(fs.readFileSync('product_mapping_draft.json', 'utf8')).mapped;

const subcatIdMap = {};
const sqlStatements = [];
const mappings = [];
let mappedCount = 0;
let unmappedCount = 0;
let unmappedProducts = [];

sqlStatements.push('-- Migration: 20260905000028_subcategories.sql');
sqlStatements.push('CREATE TABLE public.subcategories (');
sqlStatements.push('    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),');
sqlStatements.push('    category_id UUID NOT NULL,');
sqlStatements.push('    name TEXT NOT NULL,');
sqlStatements.push('    sort_order INT DEFAULT 0,');
sqlStatements.push('    active BOOLEAN DEFAULT true,');
sqlStatements.push('    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
sqlStatements.push('    CONSTRAINT subcategories_category_name_key UNIQUE (category_id, name),');
sqlStatements.push('    CONSTRAINT fk_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE');
sqlStatements.push(');');
sqlStatements.push('');
sqlStatements.push('ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;');
sqlStatements.push('CREATE POLICY "Allow public read access to subcategories" ON public.subcategories FOR SELECT TO public USING (true);');
sqlStatements.push('');
sqlStatements.push('ALTER TABLE public.subcategories ADD CONSTRAINT subcategories_id_category_id_key UNIQUE (id, category_id);');
sqlStatements.push('');
sqlStatements.push('ALTER TABLE public.products ADD COLUMN subcategory_id UUID DEFAULT NULL;');
sqlStatements.push('ALTER TABLE public.products ADD CONSTRAINT fk_products_subcategory_category FOREIGN KEY (subcategory_id, category_id) REFERENCES public.subcategories(id, category_id) ON DELETE SET NULL;');
sqlStatements.push('');

sqlStatements.push('CREATE OR REPLACE FUNCTION public.get_warehouse_catalog(');
sqlStatements.push('    p_warehouse_id UUID,');
sqlStatements.push('    p_search_query TEXT DEFAULT NULL,');
sqlStatements.push('    p_limit INT DEFAULT 500');
sqlStatements.push(') RETURNS TABLE(');
sqlStatements.push('    product_id UUID,');
sqlStatements.push('    category_id UUID,');
sqlStatements.push('    subcategory_id UUID,');
sqlStatements.push('    name TEXT,');
sqlStatements.push('    description TEXT,');
sqlStatements.push('    price NUMERIC,');
sqlStatements.push('    discount_price NUMERIC,');
sqlStatements.push('    image_url TEXT,');
sqlStatements.push('    sku TEXT,');
sqlStatements.push('    barcode TEXT,');
sqlStatements.push('    is_active BOOLEAN,');
sqlStatements.push('    rating_avg NUMERIC,');
sqlStatements.push('    rating_count INT,');
sqlStatements.push('    stock_quantity INT');
sqlStatements.push(') AS $$');
sqlStatements.push('BEGIN');
sqlStatements.push('    RETURN QUERY');
sqlStatements.push('    SELECT ');
sqlStatements.push('        p.id AS product_id,');
sqlStatements.push('        p.category_id,');
sqlStatements.push('        p.subcategory_id,');
sqlStatements.push('        p.name,');
sqlStatements.push('        p.description,');
sqlStatements.push('        p.price,');
sqlStatements.push('        p.discount_price,');
sqlStatements.push('        p.image_url,');
sqlStatements.push('        p.sku,');
sqlStatements.push('        p.barcode,');
sqlStatements.push('        p.is_active,');
sqlStatements.push('        p.rating_avg,');
sqlStatements.push('        p.rating_count,');
sqlStatements.push('        ws.quantity AS stock_quantity');
sqlStatements.push('    FROM public.products p');
sqlStatements.push('    JOIN public.warehouse_stock ws ON ws.product_id = p.id');
sqlStatements.push('    WHERE ws.warehouse_id = p_warehouse_id');
sqlStatements.push('      AND p.is_active = true');
sqlStatements.push('      AND (');
sqlStatements.push('          p_search_query IS NULL ');
sqlStatements.push('          OR p.name ILIKE \'%\' || p_search_query || \'%\'');
sqlStatements.push('          OR p.sku ILIKE \'%\' || p_search_query || \'%\'');
sqlStatements.push('          OR p.barcode ILIKE \'%\' || p_search_query || \'%\'');
sqlStatements.push('      )');
sqlStatements.push('    ORDER BY p.name ASC');
sqlStatements.push('    LIMIT LEAST(COALESCE(p_limit, 500), 1000);');
sqlStatements.push('END;');
sqlStatements.push('$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;');
sqlStatements.push('');
sqlStatements.push('GRANT EXECUTE ON FUNCTION public.get_warehouse_catalog(UUID, TEXT, INT) TO authenticated;');
sqlStatements.push('');

Object.keys(draft).forEach(catName => {
  const catObj = draft[catName];
  Object.keys(catObj).forEach(subcatName => {
    let catId = products.find(p => p.categories.name === catName)?.category_id;
    if (catId) {
      let subcatId = crypto.randomUUID();
      subcatIdMap[`${catName}|${subcatName}`] = subcatId;
      sqlStatements.push(`INSERT INTO public.subcategories (id, category_id, name) VALUES ('${subcatId}', '${catId}', '${subcatName.replace(/'/g, "''")}');`);
    }
  });
});
sqlStatements.push('');

const manualMap = {
  'Amul Kool Kesar (TEST3)': null,
  'Sunfeast Dark Fantasy Choco Fills': 'Biscuits',
  'Prestige Popular Aluminium Pressure Cooker': 'Cookware',
  'Pigeon Favourite Electric Kettle': 'Appliances',
  'Bajaj Majesty DX 11 Dry Iron': 'Appliances',
  'Butterfly Premium Vegetable Chopper': 'Kitchen Tools',
  'Borosil Glass Mixing Bowl Set': 'Cookware',
  'Cello Opalware Dinner Plate Set': 'Cookware',
  'Milton Thermosteel Bottle': 'Kitchen Tools',
  'Prestige Omega Deluxe Granite Fry Pan': 'Cookware',
  'Cello Max Fresh Container Set': 'Kitchen Tools',
  'Syska Power Bank P1001': 'Mobile Accessories',
  'Eveready AAA Batteries': 'Batteries',
  'Duracell Alkaline AA Batteries': 'Batteries',
  'Philips LED Bulb 9W': 'Lighting',
  'boAt BassHeads 100 Wired Earphones': 'Mobile Accessories',
  'Dettol Original Soap': 'Soaps & Body Wash',
  'Nivea Men Deep Impact Body Wash': 'Soaps & Body Wash',
  'Fiama Gel Bar Celebration Pack': 'Soaps & Body Wash',
  'Lux Soft Touch Soap': 'Soaps & Body Wash'
};

let cookwareCatId = products.find(p => p.categories.name === 'Kitchenware & Appliances')?.category_id;
if (cookwareCatId) {
  const ex = ['Cookware', 'Appliances', 'Kitchen Tools'];
  ex.forEach(s => {
    let sid = crypto.randomUUID();
    subcatIdMap[`Kitchenware & Appliances|${s}`] = sid;
    sqlStatements.push(`INSERT INTO public.subcategories (id, category_id, name) VALUES ('${sid}', '${cookwareCatId}', '${s}');`);
  });
}
let elecCatId = products.find(p => p.categories.name === 'Electronics & Accessories')?.category_id;
if (elecCatId) {
  const ex = ['Batteries', 'Lighting'];
  ex.forEach(s => {
    let sid = crypto.randomUUID();
    subcatIdMap[`Electronics & Accessories|${s}`] = sid;
    sqlStatements.push(`INSERT INTO public.subcategories (id, category_id, name) VALUES ('${sid}', '${elecCatId}', '${s}');`);
  });
}

sqlStatements.push('');

products.forEach(p => {
  let proposedSubcat = null;
  const catName = p.categories.name;
  
  if (manualMap[p.name] !== undefined) {
    proposedSubcat = manualMap[p.name];
  } else {
    if (draft[catName]) {
      for (let subcat in draft[catName]) {
        if (draft[catName][subcat].includes(p.name)) {
          proposedSubcat = subcat;
          break;
        }
      }
    }
  }

  if (proposedSubcat) {
    const subcatId = subcatIdMap[`${catName}|${proposedSubcat}`];
    if (subcatId) {
      sqlStatements.push(`UPDATE public.products SET subcategory_id = '${subcatId}' WHERE id = '${p.id}';`);
      mappings.push(`${p.id} | ${p.name} | ${catName} | ${proposedSubcat}`);
      mappedCount++;
    } else {
      unmappedProducts.push({ name: p.name, reason: 'No subcat ID found' });
      unmappedCount++;
    }
  } else {
    mappings.push(`${p.id} | ${p.name} | ${catName} | NULL`);
    unmappedProducts.push({ name: p.name, reason: 'Ambiguous/unmapped' });
    unmappedCount++;
  }
});

fs.writeFileSync('../supabase/migrations/20260905000028_subcategories.sql', sqlStatements.join('\n'));
fs.writeFileSync('mapping_report.txt', 'MAPPED: ' + mappedCount + '\nUNMAPPED: ' + unmappedCount + '\n\n' + mappings.join('\n'));
fs.writeFileSync('unmapped.json', JSON.stringify(unmappedProducts, null, 2));
console.log('Done!');
