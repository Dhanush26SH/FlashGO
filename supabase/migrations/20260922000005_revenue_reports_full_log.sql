-- Migration: 20260922000005_revenue_reports_full_log.sql
-- Description: Add detailed customer and item information to the Orders export log.

CREATE OR REPLACE FUNCTION public.admin_get_financial_export_data(
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_orders jsonb;
    v_category_sales jsonb;
    v_payment_breakdown jsonb;
    v_refunds jsonb;
    v_payouts jsonb;
    v_payroll jsonb;
    v_procurement jsonb;
BEGIN
    -- Verify admin role
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Orders Sheet Data (Full Log)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'Order ID', o.id,
            'Delivery Date', oe.delivered_at,
            'Warehouse ID', o.warehouse_id,
            'Customer Name', p.full_name,
            'Delivery Address', o.delivery_address,
            'Total Items', (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id),
            'GOV (₹)', o.total_amount + o.discount_amount,
            'Discount (₹)', o.discount_amount,
            'Coupon Code', o.coupon_code,
            'Delivery Fee (₹)', o.delivery_fee,
            'Net Amount (₹)', o.total_amount,
            'Payment Method', o.payment_method
        )
    ), '[]'::jsonb) INTO v_orders
    FROM orders o
    JOIN (
        SELECT order_id, MIN(created_at) as delivered_at
        FROM order_events
        WHERE new_status = 'delivered'
        GROUP BY order_id
    ) oe ON oe.order_id = o.id
    LEFT JOIN profiles p ON p.id = o.customer_id
    WHERE o.status = 'delivered'
      AND oe.delivered_at >= p_start_date
      AND oe.delivered_at <= p_end_date
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);

    -- Category Sales
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'Category Name', cat.name,
            'Net Sales (₹)', t.net_sales,
            'Items Sold', t.items_sold
        )
    ), '[]'::jsonb) INTO v_category_sales
    FROM (
        SELECT 
            p.category_id,
            SUM(oi.price * oi.quantity) as net_sales,
            SUM(oi.quantity) as items_sold
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        JOIN (
            SELECT order_id, MIN(created_at) as delivered_at
            FROM order_events
            WHERE new_status = 'delivered'
            GROUP BY order_id
        ) oe ON oe.order_id = o.id
        WHERE o.status = 'delivered'
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY p.category_id
    ) t
    JOIN categories cat ON t.category_id = cat.id;

    -- Payment Breakdown (Group by Date)
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payment_breakdown
    FROM (
        SELECT 
            date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as "Date",
            SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as "Online Revenue (₹)",
            SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as "COD Revenue (₹)",
            SUM(o.wallet_applied_amount) as "Wallet Used (₹)"
        FROM orders o
        JOIN (
            SELECT order_id, MIN(created_at) as delivered_at
            FROM order_events
            WHERE new_status = 'delivered'
            GROUP BY order_id
        ) oe ON oe.order_id = o.id
        WHERE o.status = 'delivered'
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata')
    ) t;

    -- Refunds
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'Refund ID', r.id,
            'Order ID', r.order_id,
            'Date', r.created_at,
            'Reason', r.reason,
            'Amount (₹)', r.amount
        )
    ), '[]'::jsonb) INTO v_refunds
    FROM refunds r
    JOIN orders o ON r.order_id = o.id
    WHERE r.status = 'completed'
      AND r.created_at >= p_start_date
      AND r.created_at <= p_end_date
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);

    -- Payouts
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payouts
    FROM (
        SELECT 
            id as "Settlement ID", 
            paid_at as "Date", 
            warehouse_id as "Warehouse ID", 
            'Picker' as "Role", 
            net_amount as "Net Amount (₹)"
        FROM picker_settlements
        WHERE status = 'paid'
          AND paid_at >= p_start_date
          AND paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
        UNION ALL
        SELECT 
            id as "Settlement ID", 
            paid_at as "Date", 
            warehouse_id as "Warehouse ID", 
            'Driver' as "Role", 
            net_amount as "Net Amount (₹)"
        FROM driver_settlements
        WHERE status = 'paid'
          AND paid_at >= p_start_date
          AND paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    ) t;

    -- Warehouse Payroll
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'Payroll ID', wp.id,
            'Salary Month', wp.salary_month,
            'Staff Name', p.full_name,
            'Warehouse ID', p.warehouse_id,
            'Net Salary (₹)', wp.net_salary
        )
    ), '[]'::jsonb) INTO v_payroll
    FROM warehouse_staff_payroll wp
    JOIN profiles p ON wp.staff_id = p.id
    WHERE wp.status = 'paid'
      AND wp.paid_at >= p_start_date
      AND wp.paid_at <= p_end_date
      AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

    -- Procurement
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'PO ID', id,
            'Date', created_at,
            'Warehouse ID', warehouse_id,
            'Total Cost (₹)', total_cost
        )
    ), '[]'::jsonb) INTO v_procurement
    FROM procurement_orders
    WHERE created_at >= p_start_date
      AND created_at <= p_end_date
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

    RETURN jsonb_build_object(
        'orders', v_orders,
        'category_sales', v_category_sales,
        'payment_breakdown', v_payment_breakdown,
        'refunds', v_refunds,
        'workforce_payouts', v_payouts,
        'warehouse_payroll', v_payroll,
        'procurement_spend', v_procurement
    );
END;
$$;
