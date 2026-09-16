SELECT 
  o.id AS order_id, 
  o.status AS order_status, 
  o.trip_id AS order_trip_id,
  t.id AS trip_id,
  t.status AS trip_status,
  t.order_id AS trip_order_id,
  oi.product_id,
  oi.quantity
FROM orders o
LEFT JOIN logistics_trips t ON t.order_id = o.id OR o.trip_id = t.id
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.order_number = 'FG-20260916-1BAE2';

SELECT 
  drt.id AS return_task_id,
  drt.trip_id AS task_trip_id,
  drt.return_type,
  drt.status AS task_status,
  ri.id AS intake_id,
  ri.status AS intake_status,
  ri.trip_id AS intake_trip_id,
  ri.driver_return_task_id AS intake_task_id
FROM orders o
LEFT JOIN driver_return_tasks drt ON drt.trip_id = o.trip_id OR o.id = (SELECT order_id FROM logistics_trips WHERE id = drt.trip_id)
LEFT JOIN return_intakes ri ON ri.driver_return_task_id = drt.id
WHERE o.order_number = 'FG-20260916-1BAE2';
