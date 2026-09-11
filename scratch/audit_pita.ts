import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: products } = await supabase.from('products').select('*, categories(name), subcategories(name)').eq('name', 'Baked Pita Chips');
  
  if (!products || products.length === 0) {
    console.log('No Baked Pita Chips found.');
    return;
  }

  const ids = products.map(p => p.id);
  
  // Check inventory batches
  const { data: batches } = await supabase.from('inventory_batches').select('*').in('product_id', ids);
  
  // Check stock ledgers (assuming inventory exists if ledgers or stock_quantity > 0)
  const { data: stock_ledger } = await supabase.from('stock_ledger').select('*').in('product_id', ids);
  
  // Check order items
  const { data: order_items } = await supabase.from('order_items').select('*').in('product_id', ids);
  
  // Check carts
  const { data: cart_items } = await supabase.from('cart_items').select('*').in('product_id', ids);

  let uniqueIds = new Set();
  let uniqueSkus = new Set();
  let rowDetails = [];
  let sizes = new Set();
  
  for (const p of products) {
    uniqueIds.add(p.id);
    uniqueSkus.add(p.sku);
    sizes.add(p.description);
    
    // Udupi / Manipal stock (stock_quantity in products table, maybe warehouse stock in another table or by warehouse_location)
    // FlashGO DB uses stock_quantity directly on products sometimes or in stock_ledgers. Let's gather basic stock_quantity
    
    let pBatches = batches ? batches.filter(b => b.product_id === p.id).length : 0;
    let pOrders = order_items ? order_items.filter(o => o.product_id === p.id).length : 0;
    let pCarts = cart_items ? cart_items.filter(c => c.product_id === p.id).length : 0;
    
    rowDetails.push({
      id: p.id,
      sku: p.sku,
      category: p.categories?.name,
      subcategory: p.subcategories?.name,
      price: p.price,
      discount_price: p.discount_price,
      description: p.description,
      is_active: p.is_active,
      image_url: p.image_url,
      created_at: p.created_at,
      stock_quantity: p.stock_quantity,
      warehouse: p.warehouse_location,
      batches: pBatches,
      orders: pOrders,
      carts: pCarts
    });
  }

  console.log('BAKED PITA CHIPS ROWS:', products.length);
  console.log('UNIQUE PRODUCT IDS:', uniqueIds.size);
  console.log('UNIQUE SKUS:', uniqueSkus.size);
  console.log('ROW-BY-ROW DETAILS:');
  rowDetails.forEach((r, i) => {
    console.log(`  Row ${i+1}: ID=${r.id} SKU=${r.sku} Cat=${r.category} Subcat=${r.subcategory}`);
    console.log(`          Price=${r.price} Disc=${r.discount_price} Desc='${r.description}' Active=${r.is_active} Image=${r.image_url}`);
    console.log(`          Created=${r.created_at} Stock=${r.stock_quantity} WH=${r.warehouse}`);
    console.log(`          Batches=${r.batches} Orders=${r.orders} Carts=${r.carts}`);
  });

  const differentSizes = sizes.size > 1 ? 'YES' : 'NO';
  const inventoryExists = rowDetails.some(r => r.stock_quantity > 0 || r.batches > 0) ? 'YES' : 'NO';
  const refs = rowDetails.some(r => r.orders > 0 || r.carts > 0) ? 'YES' : 'NO';
  
  let classification = 'INCONCLUSIVE';
  if (uniqueSkus.size < products.length) classification = 'ACCIDENTAL DUPLICATES';
  else if (sizes.size > 1 && uniqueSkus.size === products.length) classification = 'LEGITIMATE VARIANTS';
  
  let recommendation = 'Keep as is';
  if (classification === 'ACCIDENTAL DUPLICATES') {
    recommendation = 'Identify the row with active inventory/orders as primary. Soft-delete (is_active=false) the duplicates.';
  } else if (classification === 'LEGITIMATE VARIANTS') {
    recommendation = 'Rename display names to include the size/variant description so they are distinguishable to the customer.';
  }

  console.log('DIFFERENT SIZES/VARIANTS:', differentSizes);
  console.log('INVENTORY EXISTS:', inventoryExists);
  console.log('ORDER/RESERVATION REFERENCES:', refs);
  console.log('CLASSIFICATION:', classification);
  console.log('RECOMMENDED SAFE FIX:', recommendation);
  console.log('DATABASE CHANGES: NONE');
  console.log('MIGRATIONS: NONE');
}
run();
