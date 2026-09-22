-- Check orders.status enum values
SELECT unnest(enum_range(NULL::order_status)) AS status_val;

-- Check order payment methods and statuses used in actual data
SELECT DISTINCT payment_method FROM orders;
SELECT DISTINCT payment_status FROM orders;

-- Check wallet_applied_amount vs total_amount in orders
SELECT subtotal_amount, delivery_fee, handling_fee, tax_amount, discount_amount, wallet_applied_amount, refunded_amount, total_amount
FROM orders
WHERE status = 'delivered'
LIMIT 5;

-- Check refunds vs orders.refunded_amount
SELECT o.id, o.refunded_amount, SUM(r.amount) as refund_sum
FROM orders o
LEFT JOIN refunds r ON o.id = r.order_id
WHERE o.refunded_amount > 0 OR r.amount > 0
GROUP BY o.id, o.refunded_amount
LIMIT 5;

-- Check how logistics trips handled delivered_at
SELECT id, delivered_at FROM logistics_trips WHERE status = 'delivered' LIMIT 5;

-- Check order_events for delivered
SELECT event_type, new_status, created_at FROM order_events WHERE new_status = 'delivered' LIMIT 5;

-- Check package.json for excel
-- (I will use grep or view_file for this instead)
