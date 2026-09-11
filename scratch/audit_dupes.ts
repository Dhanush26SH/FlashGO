import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function getDetails(productNames: string[]) {
  const { data: products } = await supabase.from('products').select('*, categories(name), subcategories(name)').in('name', productNames);
  
  if (!products || products.length === 0) return [];

  const ids = products.map(p => p.id);
  
  const { data: batches } = await supabase.from('inventory_batches').select('*').in('product_id', ids);
  const { data: order_items } = await supabase.from('order_items').select('*').in('product_id', ids);
  const { data: cart_items } = await supabase.from('cart_items').select('*').in('product_id', ids);
  const { data: inventory_reservations } = await supabase.from('inventory_reservations').select('*').in('product_id', ids);

  let rowDetails = [];
  
  for (const p of products) {
    let pBatches = batches ? batches.filter(b => b.product_id === p.id).length : 0;
    let pOrders = order_items ? order_items.filter(o => o.product_id === p.id).length : 0;
    let pCarts = cart_items ? cart_items.filter(c => c.product_id === p.id).length : 0;
    let pReservations = inventory_reservations ? inventory_reservations.filter(r => r.product_id === p.id).length : 0;
    
    rowDetails.push({
      id: p.id,
      name: p.name,
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
      batches: pBatches,
      orders: pOrders,
      carts: pCarts,
      reservations: pReservations
    });
  }
  return rowDetails;
}

async function run() {
  const avocadoDetails = await getDetails(['Fresh Hass Avocados']);
  const amulDetails = await getDetails(['Amul Gold Full Cream Milk']);
  const potatoDetails = await getDetails(['Potato']);

  // Analyze Avocados
  const avocadoActive = avocadoDetails.filter(p => p.is_active).length;
  const avocadoSkus = new Set(avocadoDetails.map(p => p.sku));
  const avocadoSizes = new Set(avocadoDetails.map(p => p.description));
  let avocadoClass = 'INCONCLUSIVE';
  if (avocadoSkus.size < avocadoDetails.length) avocadoClass = 'ACCIDENTAL DUPLICATES';
  else if (avocadoSizes.size === 1 && avocadoDetails.every(p => p.price === avocadoDetails[0].price)) avocadoClass = 'ACCIDENTAL DUPLICATES';
  else avocadoClass = 'LEGITIMATE VARIANTS';

  console.log(`FRESH HASS AVOCADOS TOTAL ROWS: ${avocadoDetails.length}`);
  console.log(`FRESH HASS AVOCADOS ACTIVE: ${avocadoActive}`);
  console.log(`FRESH HASS AVOCADOS CLASSIFICATION: ${avocadoClass}`);
  console.log(`AVOCADO ROW DETAILS:`);
  avocadoDetails.forEach(r => {
    console.log(`  ID=${r.id} SKU=${r.sku} Active=${r.is_active}`);
    console.log(`  Desc='${r.description}' Price=${r.price} Disc=${r.discount_price}`);
    console.log(`  Created=${r.created_at} Stock=${r.stock_quantity}`);
    console.log(`  Batches=${r.batches} Orders=${r.orders} Carts=${r.carts} Reservations=${r.reservations}\n`);
  });

  // Analyze Amul
  const amulActive = amulDetails.filter(p => p.is_active).length;
  const amulSkus = new Set(amulDetails.map(p => p.sku));
  const amulSizes = new Set(amulDetails.map(p => p.description));
  let amulClass = 'INCONCLUSIVE';
  if (amulSkus.size < amulDetails.length) amulClass = 'ACCIDENTAL DUPLICATES';
  else if (amulSizes.size > 1 && amulSkus.size === amulDetails.length && amulDetails[0].price !== amulDetails[1].price) amulClass = 'LEGITIMATE VARIANTS';
  else if (amulSizes.size === 1 && amulDetails.every(p => p.price === amulDetails[0].price)) amulClass = 'ACCIDENTAL DUPLICATES';
  else amulClass = 'LEGITIMATE VARIANTS';

  console.log(`AMUL GOLD FULL CREAM MILK TOTAL ROWS: ${amulDetails.length}`);
  console.log(`AMUL GOLD ACTIVE: ${amulActive}`);
  console.log(`AMUL GOLD CLASSIFICATION: ${amulClass}`);
  console.log(`AMUL ROW DETAILS:`);
  amulDetails.forEach(r => {
    console.log(`  ID=${r.id} SKU=${r.sku} Active=${r.is_active}`);
    console.log(`  Desc='${r.description}' Price=${r.price} Disc=${r.discount_price}`);
    console.log(`  Created=${r.created_at} Stock=${r.stock_quantity}`);
    console.log(`  Batches=${r.batches} Orders=${r.orders} Carts=${r.carts} Reservations=${r.reservations}\n`);
  });

  // Analyze Potato
  const potatoActive = potatoDetails.filter(p => p.is_active).length;
  const potatoInactive = potatoDetails.filter(p => !p.is_active).length;
  console.log(`POTATO TOTAL ROWS: ${potatoDetails.length}`);
  console.log(`POTATO ACTIVE: ${potatoActive}`);
  console.log(`POTATO INACTIVE: ${potatoInactive}`);
  
  let potatoExp = 'There is 1 active potato and 1 inactive potato.';
  if (potatoDetails.length > 1) {
      potatoExp = 'Earlier audits likely found the inactive Potato, and our recent query rightly picked up the other Potato which happens to be active.';
  } else {
      potatoExp = 'Wait, if there is only 1 Potato and it is active, the earlier audit was likely mistaken or we changed it. Wait, the earlier audit might have counted the active/inactive status wrongly or it was reactivated?';
  }
  
  if (potatoDetails.length === 2 && potatoActive === 1 && potatoInactive === 1) {
      potatoExp = 'There are multiple rows for Potato. One is active and one is inactive. The earlier audit (which just showed Potato as inactive) was referring to the inactive row, while the current list of active products includes the active row.';
  } else if (potatoActive === 1 && potatoInactive === 0) {
      potatoExp = 'There is only 1 Potato row and it is active. The earlier audit claiming it was inactive was incorrect, or it was reactivated in the meantime.';
  }
  console.log(`POTATO DISCREPANCY EXPLANATION: ${potatoExp}\n`);

  let safeDeactivate = [];
  let transDeps = [];

  for (const r of [...avocadoDetails, ...amulDetails]) {
      const deps = r.batches + r.orders + r.carts + r.reservations;
      if (deps > 0) transDeps.push(r.id);
      else if (r.is_active) safeDeactivate.push(r.id);
  }

  let recommendedFix = '';
  if (avocadoClass === 'ACCIDENTAL DUPLICATES') {
      recommendedFix += 'For Avocados: Pick the one with dependencies or the oldest one as canonical. Deactivate the rest. ';
  } else if (avocadoClass === 'LEGITIMATE VARIANTS') {
      recommendedFix += 'For Avocados: Append size/variant to the product name. ';
  }
  
  if (amulClass === 'ACCIDENTAL DUPLICATES') {
      recommendedFix += 'For Amul: Pick the one with dependencies or oldest as canonical, deactivate the other. ';
  } else if (amulClass === 'LEGITIMATE VARIANTS') {
      recommendedFix += 'For Amul: Append the size (e.g. 500ml, 1L) to the product name so they are distinct. ';
  }

  console.log(`SAFE DUPLICATES THAT COULD BE DEACTIVATED: ${safeDeactivate.length}`);
  console.log(`ROWS WITH TRANSACTIONAL DEPENDENCIES: ${transDeps.length}`);
  console.log(`RECOMMENDED SAFE FIX: ${recommendedFix}`);
  console.log(`DATABASE CHANGES: NONE`);
  console.log(`MIGRATIONS: NONE`);
}
run();
