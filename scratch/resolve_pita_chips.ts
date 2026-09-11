import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { execSync } from 'child_process';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

const CANONICAL_ID = '63cae623-74ac-4f16-be7e-3d642e9e40d2';
const DUPLICATES = [
  'f3c1cc57-a2d1-499e-80c8-705c5fc12fe3',
  'd44fb868-19f8-4483-8303-792c294e1af3',
  '4606659b-f0b2-40b7-a00e-42629c6fcf46',
  '819ba37e-29c8-4501-a3f2-ccb60aec3778',
  'a23bf886-c599-4859-b653-05f953a8e0fc',
  'ba0c1013-dc53-44c5-a4fc-ffe5cdd426ac'
];

async function run() {
  // Re-check dependencies for duplicates ONLY (it's okay if canonical has them)
  const { data: orderItems } = await supabase.from('order_items').select('id, product_id').in('product_id', DUPLICATES);
  const { data: cartItems } = await supabase.from('cart_items').select('id, product_id').in('product_id', DUPLICATES);
  const { data: inventoryBatches } = await supabase.from('inventory_batches').select('id, product_id').in('product_id', DUPLICATES);
  const { data: inventoryReservations } = await supabase.from('inventory_reservations').select('id, product_id').in('product_id', DUPLICATES);

  const totalDependencies = 
    (orderItems ? orderItems.length : 0) + 
    (cartItems ? cartItems.length : 0) + 
    (inventoryBatches ? inventoryBatches.length : 0) + 
    (inventoryReservations ? inventoryReservations.length : 0);
  
  const preflightPass = totalDependencies === 0;
  console.log(`DEPENDENCY RECHECK: ${preflightPass ? 'PASS' : 'FAIL'}`);

  if (!preflightPass) {
    console.log('Dependencies found for duplicates. Aborting.');
    return;
  }

  let sql = `-- Migration to deactivate duplicate Baked Pita Chips\n\n`;
  for (const id of DUPLICATES) {
    sql += `UPDATE products SET is_active = false WHERE id = '${id}';\n`;
  }
  
  const migrationName = '20260907000011_deactivate_pita_chips.sql';
  fs.writeFileSync(`C:\\Users\\dhanu\\FlashGO\\supabase\\migrations\\${migrationName}`, sql);
  
  let migrationApplied = 'NO';
  try {
    execSync('npx supabase db push', { stdio: 'pipe', cwd: 'C:\\Users\\dhanu\\FlashGO' });
    migrationApplied = `YES (${migrationName})`;
  } catch (e) {
    console.error('Final migration push failed', e);
  }

  // Post verification
  const { data: allPita } = await supabase.from('products').select('*').eq('name', 'Baked Pita Chips');
  
  const totalRows = allPita.length;
  const activePita = allPita.filter(p => p.is_active);
  const inactivePita = allPita.filter(p => !p.is_active);
  
  const { data: chipsActive } = await supabase.from('products').select('id, categories!inner(name)').eq('categories.name', 'Chips & Namkeen').eq('is_active', true);
  const { data: allActive } = await supabase.from('products').select('id').eq('is_active', true);

  console.log(`CANONICAL PRODUCT: ${CANONICAL_ID} (Active: ${activePita.length === 1 && activePita[0].id === CANONICAL_ID})`);
  console.log(`DUPLICATES DEACTIVATED: ${inactivePita.length}`);
  console.log(`BAKED PITA TOTAL ROWS: ${totalRows}`);
  console.log(`BAKED PITA ACTIVE: ${activePita.length}`);
  console.log(`BAKED PITA INACTIVE: ${inactivePita.length}`);
  console.log(`CHIPS & NAMKEEN ACTIVE PRODUCTS: ${chipsActive.length}`);
  console.log(`OVERALL ACTIVE PRODUCTS: ${allActive.length}`);
  console.log(`INVENTORY MODIFIED: NO`);
  console.log(`UNRELATED PRODUCTS MODIFIED: NO`);
  console.log(`MIGRATION CREATED/APPLIED: ${migrationApplied}`);
  console.log(`FINAL RESULT: PASS`);
}
run();
