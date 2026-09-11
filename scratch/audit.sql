SELECT
  (SELECT count(*) FROM warehouses) as whRows,
  (SELECT count(*) FROM products) as prodRows,
  (SELECT count(*) FROM products WHERE is_active=true) as activeProdRows,
  (SELECT count(*) FROM warehouse_stock) as wsRows,
  (SELECT COALESCE(SUM(quantity),0) FROM warehouse_stock) as wsQty,
  (SELECT count(*) FROM product_batches) as pbRows,
  (SELECT COALESCE(SUM(available_quantity),0) FROM product_batches) as pbQty,
  (SELECT count(*) FROM stock_ledgers) as slRows,
  (SELECT count(*) FROM inventory_reservations) as irRows,
  (SELECT count(*) FROM vendors) as vendorRows,
  (SELECT count(*) FROM procurement_orders) as poRows,
  (SELECT count(*) FROM procurement_order_items) as poiRows;

SELECT warehouse_id, count(*) as wsRows, count(distinct product_id) as dp, COALESCE(SUM(quantity),0) as sq FROM warehouse_stock GROUP BY warehouse_id;

SELECT warehouse_id, count(*) as pbRows, COALESCE(SUM(available_quantity),0) as pbSq, COALESCE(SUM(case when status='active' then available_quantity else 0 end),0) as pbSa FROM product_batches GROUP BY warehouse_id;

SELECT warehouse_id, count(*) as slRows FROM stock_ledgers GROUP BY warehouse_id;

SELECT warehouse_id, COALESCE(SUM(quantity),0) as irSq FROM inventory_reservations GROUP BY warehouse_id;

SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('warehouse_stock', 'product_batches', 'stock_ledgers', 'vendors', 'procurement_orders', 'procurement_order_items') AND table_schema = 'public' ORDER BY table_name, ordinal_position;

SELECT DISTINCT reason FROM stock_ledgers;

SELECT p.name, ws.warehouse_id, ws.quantity FROM products p JOIN warehouse_stock ws ON p.id = ws.product_id WHERE p.name IN ('Apple iPhone 15 Pro Max', 'Amul Gold Full Cream Milk', 'Aashirvaad Shudh Chakki Atta', 'Amul Kool Kesar', 'Artificial Potted Succulent Plant');

SELECT p.name, pb.warehouse_id, pb.available_quantity, pb.batch_number FROM products p JOIN product_batches pb ON p.id = pb.product_id WHERE p.name IN ('Apple iPhone 15 Pro Max', 'Amul Gold Full Cream Milk', 'Aashirvaad Shudh Chakki Atta', 'Amul Kool Kesar', 'Artificial Potted Succulent Plant');

SELECT p.name, sl.warehouse_id, count(sl.id) as slRows FROM products p JOIN stock_ledgers sl ON p.id = sl.product_id WHERE p.name IN ('Apple iPhone 15 Pro Max', 'Amul Gold Full Cream Milk', 'Aashirvaad Shudh Chakki Atta', 'Amul Kool Kesar', 'Artificial Potted Succulent Plant') GROUP BY p.name, sl.warehouse_id;
