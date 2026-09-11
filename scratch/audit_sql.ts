import { execSync } from 'child_process';
import * as fs from 'fs';

function runQuery(sql: string): any[] {
  try {
    // Write SQL to a temp file to avoid quoting issues
    fs.writeFileSync('scratch/temp_query.sql', sql);
    const output = execSync('npx supabase db query scratch/temp_query.sql --linked', { stdio: 'pipe', encoding: 'utf-8' });
    
    // The output contains a boundary and then a "rows" array.
    // E.g.
    // Initialising login role...
    // { "boundary": "...", "rows": [ ... ], "warning": "..." }
    const jsonMatch = output.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return parsed.rows || [];
    }
    return [];
  } catch (e: any) {
    console.error('Error running query:', sql, '\n', e.message);
    return [];
  }
}

async function run() {
  console.log('--- RAW TABLE COUNTS ---');
  
  const getCount = (table: string) => {
    const res = runQuery(`SELECT count(*) as c FROM ${table}`);
    return res[0]?.c || 0;
  };
  const getSum = (table: string, col: string) => {
    const res = runQuery(`SELECT SUM(${col}) as s FROM ${table}`);
    return res[0]?.s || 0;
  };

  const whRows = getCount('warehouses');
  const prodRows = getCount('products');
  const activeProdRows = runQuery(`SELECT count(*) as c FROM products WHERE is_active=true`)[0]?.c || 0;
  const wsRows = getCount('warehouse_stock');
  const wsQty = getSum('warehouse_stock', 'quantity');
  const pbRows = getCount('product_batches');
  const pbQty = getSum('product_batches', 'quantity_remaining');
  const slRows = getCount('stock_ledgers');
  const irRows = getCount('inventory_reservations');
  const vendorRows = getCount('vendors');
  const poRows = getCount('procurement_orders');
  const poiRows = getCount('procurement_order_items');

  console.log(`WAREHOUSES: ${whRows}`);
  console.log(`PRODUCT ROWS: ${prodRows}`);
  console.log(`ACTIVE PRODUCTS: ${activeProdRows}`);
  console.log(`WAREHOUSE_STOCK ROWS: ${wsRows}`);
  console.log(`WAREHOUSE_STOCK TOTAL QUANTITY: ${wsQty}`);
  console.log(`PRODUCT_BATCH ROWS: ${pbRows}`);
  console.log(`PRODUCT_BATCH TOTAL QUANTITY: ${pbQty}`);
  console.log(`STOCK_LEDGER ROWS: ${slRows}`);
  console.log(`RESERVATIONS: ${irRows}`);
  console.log(`VENDORS: ${vendorRows}`);
  console.log(`PROCUREMENT ORDERS: ${poRows}`);
  console.log(`PROCUREMENT ORDER ITEMS: ${poiRows}`);

  console.log('\n--- WAREHOUSE VERIFICATION ---');
  const checkWH = (id: string, name: string) => {
    const ws = runQuery(`SELECT count(*) as c, SUM(quantity) as sq, count(distinct product_id) as dp FROM warehouse_stock WHERE warehouse_id='${id}'`);
    const pb = runQuery(`SELECT count(*) as c, SUM(quantity_remaining) as sq, SUM(case when status='active' then quantity_remaining else 0 end) as sa FROM product_batches WHERE warehouse_id='${id}'`);
    const sl = runQuery(`SELECT count(*) as c FROM stock_ledgers WHERE warehouse_id='${id}'`);
    const ir = runQuery(`SELECT SUM(quantity) as sq FROM inventory_reservations WHERE warehouse_id='${id}'`);
    
    console.log(`${name.toUpperCase()} INVENTORY:`);
    console.log(`  warehouse_stock rows: ${ws[0]?.c || 0}`);
    console.log(`  distinct product IDs: ${ws[0]?.dp || 0}`);
    console.log(`  physical quantity: ${ws[0]?.sq || 0}`);
    console.log(`  product_batch rows: ${pb[0]?.c || 0}`);
    console.log(`  batch quantity: ${pb[0]?.sq || 0}`);
    console.log(`  active/non-expired batch quantity: ${pb[0]?.sa || 0}`);
    console.log(`  reservation quantity: ${ir[0]?.sq || 0}`);
    console.log(`  stock ledger rows: ${sl[0]?.c || 0}`);
  };

  checkWH('9f4d3149-f3e4-432b-98b6-f17af77c9c33', 'Udupi');
  checkWH('76525a09-3fd1-4949-b45e-49c77255b4ce', 'Manipal');

  console.log('\n--- SCHEMA INSPECTION ---');
  const cols = runQuery(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_name IN ('warehouse_stock', 'product_batches', 'stock_ledgers', 'vendors', 'procurement_orders', 'procurement_order_items')
      AND table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const groupedCols: any = {};
  for (const c of cols) {
    if (!groupedCols[c.table_name]) groupedCols[c.table_name] = [];
    groupedCols[c.table_name].push(c.column_name);
  }
  for (const t in groupedCols) {
    console.log(`${t} columns: ${groupedCols[t].join(', ')}`);
  }

  console.log('\n--- DAMAGED/EXPIRED VERIFICATION ---');
  const slTypes = runQuery(`SELECT DISTINCT movement_type FROM stock_ledgers`);
  const slReasons = runQuery(`SELECT DISTINCT reason FROM stock_ledgers`);
  console.log(`Recent stock_ledgers movement_types: ${slTypes.map((r: any) => r.movement_type).join(', ')}`);
  console.log(`Recent stock_ledgers reasons: ${slReasons.map((r: any) => r.reason).join(', ')}`);

  console.log('\n--- SAMPLE PRODUCTS ---');
  const samples = [
    { name: 'Apple iPhone 15 Pro Max', type: 'Electronics' },
    { id: '9701ec5a-3fa0-4503-8404-3e6ce538fdaa', type: 'Canonical Amul Gold Full Cream Milk' },
    { name: 'Aashirvaad Shudh Chakki Atta', type: 'Grocery' },
    { name: 'Amul Kool Kesar', type: 'FEFO Test' },
    { name: 'Artificial Potted Succulent Plant', type: 'Decor' }
  ];

  for (const s of samples) {
    let where = s.id ? `id='${s.id}'` : `name='${s.name.replace(/'/g, "''")}' AND is_active=true`;
    const prod = runQuery(`SELECT id, name FROM products WHERE ${where} LIMIT 1`)[0];
    if (prod) {
      console.log(`Product: ${prod.name} (${s.type})`);
      const ws = runQuery(`SELECT warehouse_id, quantity FROM warehouse_stock WHERE product_id='${prod.id}'`);
      console.log(`  warehouse_stock: ${ws.length} rows (total: ${ws.reduce((acc: number, w: any) => acc + Number(w.quantity), 0)})`);
      const pb = runQuery(`SELECT warehouse_id, quantity_remaining, batch_number FROM product_batches WHERE product_id='${prod.id}'`);
      console.log(`  product_batches: ${pb.length} rows`);
      const sl = runQuery(`SELECT warehouse_id FROM stock_ledgers WHERE product_id='${prod.id}'`);
      console.log(`  stock_ledgers: ${sl.length} rows`);
    } else {
      console.log(`Product: ${s.name || s.id} (${s.type}) - NOT FOUND OR INACTIVE`);
    }
  }

}

run();
