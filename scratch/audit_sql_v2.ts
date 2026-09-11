import { execSync } from 'child_process';
import * as fs from 'fs';

function runQuery(sql: string): any[] {
  try {
    const output = execSync(`npx supabase db query "${sql}" --linked`, { stdio: 'pipe', encoding: 'utf-8' });
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
  const data = runQuery(`
    SELECT
      (SELECT count(*) FROM warehouses) as whRows,
      (SELECT count(*) FROM products) as prodRows,
      (SELECT count(*) FROM products WHERE is_active=true) as activeProdRows,
      (SELECT count(*) FROM warehouse_stock) as wsRows,
      (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock) as wsQty,
      (SELECT count(*) FROM product_batches) as pbRows,
      (SELECT COALESCE(SUM(quantity_remaining),0) FROM product_batches) as pbQty,
      (SELECT count(*) FROM stock_ledgers) as slRows,
      (SELECT count(*) FROM inventory_reservations) as irRows,
      (SELECT count(*) FROM vendors) as vendorRows,
      (SELECT count(*) FROM procurement_orders) as poRows,
      (SELECT count(*) FROM procurement_order_items) as poiRows
  `);

  const d = data[0] || {};
  console.log('--- RAW TABLE COUNTS ---');
  console.log(`WAREHOUSES: ${d.whrows}`);
  console.log(`PRODUCT ROWS: ${d.prodrows}`);
  console.log(`ACTIVE PRODUCTS: ${d.activeprodrows}`);
  console.log(`WAREHOUSE_STOCK ROWS: ${d.wsrows}`);
  console.log(`WAREHOUSE_STOCK TOTAL QUANTITY: ${d.wsqty}`);
  console.log(`PRODUCT_BATCH ROWS: ${d.pbrows}`);
  console.log(`PRODUCT_BATCH TOTAL QUANTITY: ${d.pbqty}`);
  console.log(`STOCK_LEDGER ROWS: ${d.slrows}`);
  console.log(`RESERVATIONS: ${d.irrows}`);
  console.log(`VENDORS: ${d.vendorrows}`);
  console.log(`PROCUREMENT ORDERS: ${d.porows}`);
  console.log(`PROCUREMENT ORDER ITEMS: ${d.poirows}`);

  const checkWH = (id: string, name: string) => {
    const whData = runQuery(`
      SELECT
        (SELECT count(*) FROM warehouse_stock WHERE warehouse_id='${id}') as wsRows,
        (SELECT count(distinct product_id) FROM warehouse_stock WHERE warehouse_id='${id}') as dp,
        (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock WHERE warehouse_id='${id}') as sq,
        (SELECT count(*) FROM product_batches WHERE warehouse_id='${id}') as pbRows,
        (SELECT COALESCE(SUM(quantity_remaining),0) FROM product_batches WHERE warehouse_id='${id}') as pbSq,
        (SELECT COALESCE(SUM(quantity_remaining),0) FROM product_batches WHERE warehouse_id='${id}' AND status='active') as pbSa,
        (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE warehouse_id='${id}') as irSq,
        (SELECT count(*) FROM stock_ledgers WHERE warehouse_id='${id}') as slRows
    `);
    const w = whData[0] || {};
    console.log(`\n${name.toUpperCase()} INVENTORY:`);
    console.log(`  warehouse_stock rows: ${w.wsrows}`);
    console.log(`  distinct product IDs: ${w.dp}`);
    console.log(`  physical quantity: ${w.sq}`);
    console.log(`  product_batch rows: ${w.pbrows}`);
    console.log(`  batch quantity: ${w.pbsq}`);
    console.log(`  active/non-expired batch quantity: ${w.pbsa}`);
    console.log(`  reservation quantity: ${w.irsq}`);
    console.log(`  stock ledger rows: ${w.slrows}`);
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
    let where = s.id ? `id=''${s.id}''` : `name=''${s.name.replace(/'/g, "''''")}'' AND is_active=true`;
    const prod = runQuery(`SELECT id, name FROM products WHERE ${where} LIMIT 1`)[0];
    if (prod) {
      console.log(`Product: ${prod.name} (${s.type})`);
      const ws = runQuery(`SELECT warehouse_id, quantity FROM warehouse_stock WHERE product_id=''${prod.id}''`);
      console.log(`  warehouse_stock: ${ws.length} rows (total: ${ws.reduce((acc: number, w: any) => acc + Number(w.quantity), 0)})`);
      const pb = runQuery(`SELECT warehouse_id, quantity_remaining, batch_number FROM product_batches WHERE product_id=''${prod.id}''`);
      console.log(`  product_batches: ${pb.length} rows`);
      const sl = runQuery(`SELECT warehouse_id FROM stock_ledgers WHERE product_id=''${prod.id}''`);
      console.log(`  stock_ledgers: ${sl.length} rows`);
    } else {
      console.log(`Product: ${s.name || s.id} (${s.type}) - NOT FOUND OR INACTIVE`);
    }
  }

}

run();
