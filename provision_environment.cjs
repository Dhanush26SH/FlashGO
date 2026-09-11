// Phase 17.1 Test Environment Provisioning Script
// Uses the EXACT same Supabase calls as the Admin UI

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpfuommfvrfdliloxcg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Actual product IDs from live database
const PRODUCTS = [
  { id: '888f7899-2f74-4d18-a2b5-dfce6c354287', name: 'Amul Gold Full Cream Milk' },
  { id: 'dd69d4dd-2400-4bb2-a6ce-970fc8f9e6cd', name: 'Amul Kool Kesar' },
];

const PICKER_EMAIL = 'dhanushshriyan91@gmail.com';
const ADMIN_EMAIL = 'flashgo-admin-test-v2@mailinator.com';
const ADMIN_PASSWORD = 'password123';

async function main() {
  console.log('=== Phase 17.1 Test Environment Provisioning ===\n');

  // Step 0: Authenticate as Admin (same as LoginView.tsx signInWithPassword)
  console.log('[Step 0] Authenticating as Admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authError) { console.error('FATAL: Admin login failed:', authError.message); process.exit(1); }
  console.log('  Admin authenticated. User ID:', authData.user.id);

  // Step 1: Use existing warehouse (already created via AdminService.createWarehouse path)
  const WAREHOUSE_ID = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
  console.log('\n[Step 1] Using existing warehouse:', WAREHOUSE_ID);
  const { data: warehouse } = await supabase.from('warehouses').select('*').eq('id', WAREHOUSE_ID).single();
  console.log('  Warehouse:', warehouse.name);


  // Step 2: Picker already assigned to warehouse (verified in first run)
  console.log('\n[Step 2] Verifying Picker assignment...');
  const { data: verifyPicker } = await supabase
    .from('profiles')
    .select('id, email, role, warehouse_id, is_suspended')
    .eq('email', PICKER_EMAIL)
    .single();
  console.log('  Picker:', JSON.stringify(verifyPicker, null, 2));
  if (verifyPicker.warehouse_id !== WAREHOUSE_ID) {
    console.error('FATAL: Picker warehouse_id mismatch'); process.exit(1);
  }


  // Step 3: Inward Stock Batches (same as AdminService.inwardStockBatch → supabase.rpc('inward_stock_batch'))
  console.log('\n[Step 3] Inwarding stock batches (AdminService.inwardStockBatch path)...');
  const expiryDate = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]; // 10 days from now

  for (let i = 0; i < PRODUCTS.length; i++) {
    const product = PRODUCTS[i];
    const batchNum = `BAT-TEST-${String(i + 1).padStart(2, '0')}`;
    const qty = 25 + (i * 5); // 25, 30, 35

    console.log(`  Inwarding ${product.name}: batch=${batchNum}, qty=${qty}, expiry=${expiryDate}...`);
    const { data: inwardResult, error: inwardErr } = await supabase.rpc('inward_stock_batch', {
      p_warehouse_id: warehouse.id,
      p_product_id: product.id,
      p_quantity: qty,
      p_expiry_date: expiryDate,
      p_batch_number: batchNum,
      p_admin_id: authData.user.id,
    });
    if (inwardErr) { console.error(`  FATAL: Inward failed for ${product.name}:`, inwardErr.message); process.exit(1); }
    console.log(`  Success. RPC result:`, inwardResult);
  }

  // Step 4: Verify authoritative DB state
  console.log('\n[Step 4] Verifying authoritative database state...');

  // 4a. product_batches
  console.log('\n  --- product_batches ---');
  const { data: batches } = await supabase
    .from('product_batches')
    .select('*')
    .eq('warehouse_id', warehouse.id)
    .order('created_at', { ascending: true });
  console.log(JSON.stringify(batches, null, 2));

  // 4b. warehouse_stock
  console.log('\n  --- warehouse_stock ---');
  const { data: whStock } = await supabase
    .from('warehouse_stock')
    .select('*')
    .eq('warehouse_id', warehouse.id);
  console.log(JSON.stringify(whStock, null, 2));

  // 4c. stock_ledgers
  console.log('\n  --- stock_ledgers (last 10) ---');
  const { data: ledgers } = await supabase
    .from('stock_ledgers')
    .select('*')
    .eq('warehouse_id', warehouse.id)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(JSON.stringify(ledgers, null, 2));

  // 4d. products.stock_quantity (derived cache)
  console.log('\n  --- products.stock_quantity (derived cache) ---');
  const productIds = PRODUCTS.map(p => p.id);
  const { data: productStocks } = await supabase
    .from('products')
    .select('id, name, stock_quantity')
    .in('id', productIds);
  console.log(JSON.stringify(productStocks, null, 2));

  // 4e. Sellable quantity (get_sellable_quantity RPC)
  console.log('\n  --- Sellable Quantities ---');
  for (const product of PRODUCTS) {
    const { data: sellable, error: sellErr } = await supabase.rpc('get_sellable_quantity', {
      p_product_id: product.id,
    });
    console.log(`  ${product.name}: sellable = ${sellErr ? 'ERROR: ' + sellErr.message : sellable}`);
  }

  // 4f. inventory_reservations (should be empty)
  console.log('\n  --- inventory_reservations (should be empty) ---');
  const { data: reservations } = await supabase
    .from('inventory_reservations')
    .select('*')
    .in('product_id', productIds);
  console.log(JSON.stringify(reservations, null, 2));

  console.log('\n=== Provisioning Complete ===');
  console.log('Warehouse ID:', warehouse.id);
  console.log('Picker ID:', verifyPicker.id);
  console.log('Products inwarded:', PRODUCTS.map(p => p.name).join(', '));
}

main().catch(err => { console.error('Unhandled error:', err); process.exit(1); });
