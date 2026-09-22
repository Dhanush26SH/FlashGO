SELECT json_build_object(
  'order_statuses', (SELECT json_agg(status_val) FROM (SELECT unnest(enum_range(NULL::order_status)) AS status_val) t),
  'payment_methods', (SELECT json_agg(payment_method) FROM (SELECT DISTINCT payment_method FROM orders) t),
  'payment_statuses', (SELECT json_agg(payment_status) FROM (SELECT DISTINCT payment_status FROM orders) t),
  'orders_sample', (SELECT json_agg(row_to_json(o)) FROM (SELECT subtotal_amount, delivery_fee, handling_fee, tax_amount, discount_amount, wallet_applied_amount, refunded_amount, total_amount FROM orders WHERE status = 'delivered' LIMIT 5) o),
  'refunds_sample', (SELECT json_agg(row_to_json(r)) FROM (SELECT o.id, o.refunded_amount, SUM(r.amount) as refund_sum FROM orders o LEFT JOIN refunds r ON o.id = r.order_id WHERE o.refunded_amount > 0 OR r.amount > 0 GROUP BY o.id, o.refunded_amount LIMIT 5) r),
  'trips_sample', (SELECT json_agg(row_to_json(tr)) FROM (SELECT id, delivered_at FROM logistics_trips WHERE status = 'delivered' LIMIT 5) tr)
);
