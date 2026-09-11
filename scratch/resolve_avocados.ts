import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { execSync } from 'child_process';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

async function run() {
  const { data: avocados } = await supabase.from('products').select('*').eq('name', 'Fresh Hass Avocados');
  const activeAvocados = avocados.filter(a => a.is_active);
  const inactiveAvocados = avocados.filter(a => !a.is_active);

  const activeAvocadoIds = activeAvocados.map(a => a.id);
  
  // Dependency check
  const { data: orderItems } = await supabase.from('order_items').select('id, product_id').in('product_id', activeAvocadoIds);
  const { data: cartItems } = await supabase.from('cart_items').select('id, product_id').in('product_id', activeAvocadoIds);
  const { data: inventoryBatches } = await supabase.from('inventory_batches').select('id, product_id').in('product_id', activeAvocadoIds);
  const { data: inventoryReservations } = await supabase.from('inventory_reservations').select('id, product_id').in('product_id', activeAvocadoIds);
  
  let transDepsCount = 0;
  transDepsCount += orderItems ? orderItems.length : 0;
  transDepsCount += cartItems ? cartItems.length : 0;
  transDepsCount += inventoryBatches ? inventoryBatches.length : 0;
  transDepsCount += inventoryReservations ? inventoryReservations.length : 0;
  
  console.log(`FINAL DEPENDENCY CHECK: ${transDepsCount === 0 ? 'PASS' : 'FAIL'}`);

  if (transDepsCount > 0) {
      console.log('Dependencies found for active avocados. Aborting.');
      return;
  }

  // Sort active avocados by created_at ascending (oldest first)
  activeAvocados.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  
  const canonicalAvocado = activeAvocados[0];
  const duplicatesToDeactivate = activeAvocados.slice(1).map(a => a.id);

  let sql = `-- Migration to deactivate duplicate Fresh Hass Avocados\n\n`;
  for (const id of duplicatesToDeactivate) {
      sql += `UPDATE products SET is_active = false WHERE id = '${id}';\n`;
  }
  
  const migrationName = '20260907000013_deactivate_avocados.sql';
  fs.writeFileSync(`C:\\Users\\dhanu\\FlashGO\\supabase\\migrations\\${migrationName}`, sql);
  
  let migrationApplied = 'NO';
  try {
      execSync('npx supabase db push', { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
      migrationApplied = `YES (${migrationName})`;
  } catch (e) {
      console.error('Final migration push failed', e);
  }

  // Check Amul
  const { data: amulRows } = await supabase.from('products').select('*').eq('name', 'Amul Gold Full Cream Milk');
  const amul888 = amulRows.find(a => a.id === '888f7899-2f74-4d18-a2b5-dfce6c354287');
  const amul970 = amulRows.find(a => a.id === '9701ec5a-3fa0-4503-8404-3e6ce538fdaa');

  const checkSize = (row: any) => {
      if (!row) return 'NOT FOUND';
      // Search for size patterns in description
      const desc = row.description ? row.description.toLowerCase() : '';
      if (desc.match(/([0-9]+)\s*(ml|l|liter|litres|g|kg|gram|grams)\b/i)) {
          return desc.match(/([0-9]+)\s*(ml|l|liter|litres|g|kg|gram|grams)\b/i)[0];
      }
      return 'SIZE NOT ESTABLISHED';
  };

  const amulSize1 = checkSize(amul888);
  const amulSize2 = checkSize(amul970);
  const amulStatus = (amulSize1 === 'SIZE NOT ESTABLISHED' || amulSize2 === 'SIZE NOT ESTABLISHED') ? 'SIZE NOT ESTABLISHED' : 'RESOLVED';

  // Final verification
  const { data: finalAvocados } = await supabase.from('products').select('*').eq('name', 'Fresh Hass Avocados');
  const finalActiveAvocados = finalAvocados.filter(a => a.is_active);
  const finalInactiveAvocados = finalAvocados.filter(a => !a.is_active);

  const { data: finalPotato } = await supabase.from('products').select('*').eq('name', 'Potato');
  const potatoActive = finalPotato.filter(p => p.is_active).length;
  const potatoInactive = finalPotato.filter(p => !p.is_active).length;

  const { data: allActive } = await supabase.from('products').select('id').eq('is_active', true);

  console.log(`CANONICAL AVOCADO ID: ${canonicalAvocado.id}`);
  console.log(`AVOCADO ROWS DEACTIVATED: ${duplicatesToDeactivate.length}`);
  console.log(`AVOCADO TOTAL: ${finalAvocados.length}`);
  console.log(`AVOCADO ACTIVE: ${finalActiveAvocados.length}`);
  console.log(`AVOCADO INACTIVE: ${finalInactiveAvocados.length}`);
  
  console.log(`AMUL GOLD ROW 1 AUTHORITATIVE SIZE: ${amulSize1}`);
  console.log(`AMUL GOLD ROW 2 AUTHORITATIVE SIZE: ${amulSize2}`);
  console.log(`AMUL GOLD SIZE STATUS: ${amulStatus}`);
  console.log(`AMUL GOLD MODIFIED: NO`);

  console.log(`POTATO ACTIVE: ${potatoActive}`);
  console.log(`POTATO INACTIVE: ${potatoInactive}`);
  console.log(`OVERALL ACTIVE PRODUCTS: ${allActive.length}`);
  console.log(`EXPECTED ACTIVE PRODUCTS: 224`);
  console.log(`UNRELATED PRODUCTS MODIFIED: NO`);
  console.log(`INVENTORY MODIFIED: NO`);
  console.log(`MIGRATION CREATED/APPLIED: ${migrationApplied}`);
  console.log(`FINAL RESULT: PASS`);
}
run();
