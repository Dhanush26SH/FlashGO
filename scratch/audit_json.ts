import { execSync } from 'child_process';
import * as fs from 'fs';

const sql = `
SELECT json_build_object(
  'counts', (
    SELECT json_build_object(
      'warehouses', (SELECT count(*) FROM warehouses),
      'products', (SELECT count(*) FROM products),
      'active_products', (SELECT count(*) FROM products WHERE is_active=true),
      'warehouse_stock', (SELECT count(*) FROM warehouse_stock),
      'ws_qty', (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock),
      'product_batches', (SELECT count(*) FROM product_batches),
      'pb_qty', (SELECT COALESCE(SUM(available_quantity),0) FROM product_batches),
      'stock_ledgers', (SELECT count(*) FROM stock_ledgers),
      'inventory_reservations', (SELECT count(*) FROM inventory_reservations),
      'vendors', (SELECT count(*) FROM vendors),
      'procurement_orders', (SELECT count(*) FROM procurement_orders),
      'procurement_order_items', (SELECT count(*) FROM procurement_order_items)
    )
  ),
  'udupi', (
    SELECT json_build_object(
      'ws_rows', (SELECT count(*) FROM warehouse_stock WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'ws_dp', (SELECT count(distinct product_id) FROM warehouse_stock WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'ws_qty', (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'pb_rows', (SELECT count(*) FROM product_batches WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'pb_qty', (SELECT COALESCE(SUM(available_quantity),0) FROM product_batches WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'pb_sa', (SELECT COALESCE(SUM(case when status='active' then available_quantity else 0 end),0) FROM product_batches WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'ir_qty', (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33'),
      'sl_rows', (SELECT count(*) FROM stock_ledgers WHERE warehouse_id='9f4d3149-f3e4-432b-98b6-f17af77c9c33')
    )
  ),
  'manipal', (
    SELECT json_build_object(
      'ws_rows', (SELECT count(*) FROM warehouse_stock WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'ws_dp', (SELECT count(distinct product_id) FROM warehouse_stock WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'ws_qty', (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'pb_rows', (SELECT count(*) FROM product_batches WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'pb_qty', (SELECT COALESCE(SUM(available_quantity),0) FROM product_batches WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'pb_sa', (SELECT COALESCE(SUM(case when status='active' then available_quantity else 0 end),0) FROM product_batches WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'ir_qty', (SELECT COALESCE(SUM(quantity),0) FROM inventory_reservations WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce'),
      'sl_rows', (SELECT count(*) FROM stock_ledgers WHERE warehouse_id='76525a09-3fd1-4949-b45e-49c77255b4ce')
    )
  ),
  'reasons', (SELECT json_agg(DISTINCT reason) FROM stock_ledgers),
  'samples', (
    SELECT json_agg(json_build_object('name', p.name, 'ws', (SELECT count(*) FROM warehouse_stock WHERE product_id=p.id), 'pb', (SELECT count(*) FROM product_batches WHERE product_id=p.id), 'sl', (SELECT count(*) FROM stock_ledgers WHERE product_id=p.id)))
    FROM products p WHERE p.name IN ('Apple iPhone 15 Pro Max', 'Amul Gold Full Cream Milk', 'Aashirvaad Shudh Chakki Atta', 'Amul Kool Kesar', 'Artificial Potted Succulent Plant') AND p.is_active=true
  )
) as result;
`;

try {
  fs.writeFileSync('scratch/temp_json.sql', sql);
  const out = execSync('npx supabase db query scratch/temp_json.sql --linked', { encoding: 'utf-8', stdio: 'pipe' });
  const m = out.match(/(\{[\s\S]*\})/);
  if (m) {
    const parsed = JSON.parse(m[1]);
    console.log(JSON.stringify(parsed.rows[0], null, 2));
  } else {
    console.log('No JSON matched');
    console.log(out);
  }
} catch (e: any) {
  console.log('Error', e.message);
}
