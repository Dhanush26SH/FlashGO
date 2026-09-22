-- Scratch query to test revenue_by_date logic
SELECT 
    date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as "Date",
    SUM(o.total_amount + o.discount_amount) as "GOV",
    SUM(o.total_amount) - COALESCE(SUM(cr.total_refund), 0) as "Net Revenue",
    COUNT(DISTINCT o.id) as "Delivered Orders",
    CASE WHEN COUNT(DISTINCT o.id) > 0 THEN (SUM(o.total_amount) - COALESCE(SUM(cr.total_refund), 0)) / COUNT(DISTINCT o.id) ELSE 0 END as "AOV",
    SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as "Online Revenue",
    SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as "COD Revenue",
    COALESCE(SUM(cr.total_refund), 0) as "Refunds",
    SUM(o.discount_amount) as "Discounts"
FROM orders o
JOIN (
    SELECT order_id, MIN(created_at) as delivered_at
    FROM order_events
    WHERE new_status = 'delivered'
    GROUP BY order_id
) oe ON oe.order_id = o.id
LEFT JOIN (
    SELECT order_id, SUM(amount) as total_refund
    FROM refunds
    WHERE status = 'completed'
    GROUP BY order_id
) cr ON cr.order_id = o.id
WHERE o.status = 'delivered'
GROUP BY date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata')
ORDER BY "Date";
