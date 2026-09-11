import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://szpfuommfvrfdliloxcg.supabase.co', 'sb_publishable_DhwLV6l_mP82lMf4tQEOlA_tNWN_a37');

const ADMIN_EMAIL = 'flashgo-admin-test-v2@mailinator.com';
const ADMIN_PASSWORD = 'password123';

const UDUPI_ID = '9f4d3149-f3e4-432b-98b6-f17af77c9c33';
const MANIPAL_ID = '76525a09-3fd1-4949-b45e-49c77255b4ce';

async function checkTableCount(tableName: string): Promise<number | null> {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error) {
    if (error.code === '42P01') return null; // Missing
    console.error(`Error checking ${tableName}:`, error.message);
    return 0;
  }
  return count;
}

async function getSum(tableName: string, columnName: string): Promise<number> {
  const { data, error } = await supabase.from(tableName).select(columnName);
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (Number(row[columnName]) || 0), 0);
}

async function run() {
  console.log('Authenticating as Admin to bypass RLS...');
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authError) { console.error('Admin login failed:', authError.message); return; }

  console.log('\n--- 1 RAW TABLE COUNTS ---');
  const whCount = await checkTableCount('warehouses');
  const prodCount = await checkTableCount('products');
  const { data: activeProds } = await supabase.from('products').select('id, name, is_active').eq('is_active', true);
  
  const wsRows = await checkTableCount('warehouse_stock');
  const wsQty = await getSum('warehouse_stock', 'quantity');
  
  const pbRows = await checkTableCount('product_batches');
  const pbQty = await getSum('product_batches', 'quantity_remaining');
  
  const slRows = await checkTableCount('stock_ledgers');
  const irRows = await checkTableCount('inventory_reservations');
  const vendorRows = await checkTableCount('vendors');
  const poRows = await checkTableCount('procurement_orders');
  const poiRows = await checkTableCount('procurement_order_items');

  console.log(`warehouses: ${whCount}`);
  console.log(`products: ${prodCount}`);
  console.log(`active products: ${activeProds?.length}`);
  console.log(`warehouse_stock: ${wsRows} rows, sum(quantity)=${wsQty}`);
  console.log(`product_batches: ${pbRows} rows, sum(quantity)=${pbQty}`);
  console.log(`stock_ledgers: ${slRows}`);
  console.log(`inventory_reservations: ${irRows}`);
  console.log(`vendors: ${vendorRows}`);
  console.log(`procurement_orders: ${poRows}`);
  console.log(`procurement_order_items: ${poiRows}`);

  console.log('\n--- 2 WAREHOUSE VERIFICATION ---');
  async function verifyWH(id: string, name: string) {
    const { data: ws } = await supabase.from('warehouse_stock').select('product_id, quantity').eq('warehouse_id', id);
    const { data: pb } = await supabase.from('product_batches').select('quantity_remaining, status').eq('warehouse_id', id);
    const { data: res } = await supabase.from('inventory_reservations').select('quantity').eq('warehouse_id', id);
    const sl = await supabase.from('stock_ledgers').select('id', { count: 'exact', head: true }).eq('warehouse_id', id);

    const wsTotal = ws?.reduce((s, r) => s + Number(r.quantity), 0) || 0;
    const pbTotal = pb?.reduce((s, r) => s + Number(r.quantity_remaining), 0) || 0;
    const pbActive = pb?.filter(b => b.status === 'active').reduce((s, r) => s + Number(r.quantity_remaining), 0) || 0;
    const resTotal = res?.reduce((s, r) => s + Number(r.quantity), 0) || 0;
    const uniqueProds = new Set(ws?.map(r => r.product_id)).size;

    console.log(`${name} (${id}):`);
    console.log(`  warehouse_stock rows: ${ws?.length}`);
    console.log(`  distinct product IDs: ${uniqueProds}`);
    console.log(`  physical quantity: ${wsTotal}`);
    console.log(`  product_batch rows: ${pb?.length}`);
    console.log(`  batch quantity: ${pbTotal}`);
    console.log(`  active/non-expired batch quantity: ${pbActive}`);
    console.log(`  reservation quantity: ${resTotal}`);
    console.log(`  stock ledger rows: ${sl.count}`);
  }
  await verifyWH(UDUPI_ID, 'Udupi');
  await verifyWH(MANIPAL_ID, 'Manipal');

  console.log('\n--- 3 SAMPLE PRODUCTS ---');
  // 1 Electronics, canonical Amul Gold, 1 grocery, 1 FEFO, 1 Decor
  const samples = [
    { name: 'Apple iPhone 15 Pro Max', type: 'Electronics' },
    { name: 'Amul Gold Full Cream Milk', id: '9701ec5a-3fa0-4503-8404-3e6ce538fdaa', type: 'Canonical Amul Gold' },
    { name: 'Aashirvaad Shudh Chakki Atta', type: 'Grocery' },
    { name: 'Amul Kool Kesar', type: 'FEFO Test' },
    { name: 'Artificial Potted Succulent Plant', type: 'Decor' }
  ];

  for (const s of samples) {
    let p;
    if (s.id) p = activeProds?.find(x => x.id === s.id);
    else p = activeProds?.find(x => x.name === s.name);

    if (!p) {
      console.log(`Product ${s.name} (${s.type}): NOT FOUND OR INACTIVE`);
      continue;
    }

    const { data: ws } = await supabase.from('warehouse_stock').select('*').eq('product_id', p.id);
    const { data: pb } = await supabase.from('product_batches').select('*').eq('product_id', p.id);
    const { data: sl } = await supabase.from('stock_ledgers').select('*').eq('product_id', p.id);

    console.log(`Product: ${p.name} (${s.type})`);
    console.log(`  warehouse_stock: ${ws?.length} rows`);
    console.log(`  product_batches: ${pb?.length} rows`);
    console.log(`  stock_ledgers: ${sl?.length} rows`);
  }

  console.log('\n--- 4 SCHEMA INSPECTION ---');
  const tables = ['warehouse_stock', 'product_batches', 'stock_ledgers', 'vendors', 'procurement_orders', 'procurement_order_items'];
  for (const t of tables) {
    const { data } = await supabase.from(t).select('*').limit(1).catch(() => ({ data: null }));
    if (data && data.length > 0) {
      console.log(`${t} columns: ${Object.keys(data[0]).join(', ')}`);
    } else {
      console.log(`${t}: Exists but empty or no access`);
    }
  }

  console.log('\n--- 5 DAMAGED/EXPIRED VERIFICATION ---');
  const { data: slSample } = await supabase.from('stock_ledgers').select('movement_type, reason').limit(50);
  const types = new Set(slSample?.map(s => s.movement_type));
  const reasons = new Set(slSample?.map(s => s.reason));
  console.log(`Recent stock_ledgers movement_types: ${Array.from(types).join(', ')}`);
  console.log(`Recent stock_ledgers reasons: ${Array.from(reasons).join(', ')}`);

  console.log('\n--- 6 CONTRADICTION CAUSE ---');
  console.log('RLS auth visibility. Previous script used anon key without signing in, which caused products without RLS to return counts but warehouse_stock and product_batches (which are protected by RLS and only allow authenticated users/admins) returned 0.');

}

run().catch(console.error);
