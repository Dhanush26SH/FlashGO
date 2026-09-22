-- Migration: 20260922000006_revenue_reports_excel.sql
-- Description: Implement Phase 3 Revenue & Reports full management export schema.

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
    v_revenue_by_date jsonb;
    v_warehouse_perf jsonb;
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

    -- 1. Revenue by Date
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_revenue_by_date
    FROM (
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
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY "Date"
    ) t;

    -- 2. Warehouse Performance
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_warehouse_perf
    FROM (
        SELECT 
            w.name as "Warehouse",
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
        JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN (
            SELECT order_id, SUM(amount) as total_refund
            FROM refunds
            WHERE status = 'completed'
            GROUP BY order_id
        ) cr ON cr.order_id = o.id
        WHERE o.status = 'delivered'
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY w.name
        ORDER BY "GOV" DESC
    ) t;

    -- 3. Orders Sheet Data
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_orders
    FROM (
        SELECT 
            o.id as "Order ID",
            date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as "Delivered Date",
            to_char(oe.delivered_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI:SS') as "Delivered Time",
            w.name as "Warehouse",
            o.payment_method as "Payment Method",
            o.payment_status as "Payment Status",
            o.total_amount + o.discount_amount as "GOV",
            o.discount_amount as "Discount",
            o.total_amount as "Final Total",
            COALESCE(cr.total_refund, 0) as "Refund Amount",
            o.total_amount - COALESCE(cr.total_refund, 0) as "Net Revenue"
        FROM orders o
        JOIN (
            SELECT order_id, MIN(created_at) as delivered_at
            FROM order_events
            WHERE new_status = 'delivered'
            GROUP BY order_id
        ) oe ON oe.order_id = o.id
        JOIN warehouses w ON w.id = o.warehouse_id
        LEFT JOIN (
            SELECT order_id, SUM(amount) as total_refund
            FROM refunds
            WHERE status = 'completed'
            GROUP BY order_id
        ) cr ON cr.order_id = o.id
        WHERE o.status = 'delivered'
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ORDER BY oe.delivered_at DESC
    ) t;

    -- 4. Category Sales
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_category_sales
    FROM (
        SELECT 
            cat.name as "Category",
            SUM(oi.quantity) as "Items Sold",
            COUNT(DISTINCT o.id) as "Delivered Orders",
            SUM(oi.price * oi.quantity) as "Sales Value"
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        JOIN (
            SELECT order_id, MIN(created_at) as delivered_at
            FROM order_events
            WHERE new_status = 'delivered'
            GROUP BY order_id
        ) oe ON oe.order_id = o.id
        JOIN categories cat ON p.category_id = cat.id
        WHERE o.status = 'delivered'
          AND oe.delivered_at >= p_start_date
          AND oe.delivered_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY cat.name
        ORDER BY "Sales Value" DESC
    ) t;

    -- 5. Payment Breakdown
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payment_breakdown
    FROM (
        SELECT 
            date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as "Date",
            SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as "Online Revenue",
            SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as "COD Revenue",
            SUM(o.wallet_applied_amount) as "Wallet Used",
            SUM(o.total_amount) as "Total Delivered Revenue"
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
        ORDER BY "Date"
    ) t;

    -- 6. Refunds
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_refunds
    FROM (
        SELECT 
            r.id as "Refund ID",
            r.order_id as "Order ID",
            r.created_at as "Refund Date",
            w.name as "Warehouse",
            r.amount as "Amount",
            r.reason as "Reason",
            r.status as "Status"
        FROM refunds r
        JOIN orders o ON r.order_id = o.id
        JOIN warehouses w ON w.id = o.warehouse_id
        WHERE r.status = 'completed'
          AND r.created_at >= p_start_date
          AND r.created_at <= p_end_date
          AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ORDER BY r.created_at DESC
    ) t;

    -- 7. Workforce Payouts
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payouts
    FROM (
        SELECT 
            ps.id as "Settlement ID", 
            ps.paid_at as "Paid Date", 
            'Picker' as "Role",
            w.name as "Warehouse", 
            ps.total_amount as "Gross Earnings",
            NULL::numeric as "Bonus/Adjustments",
            NULL::numeric as "Deductions/Penalties",
            ps.total_amount as "Net Paid"
        FROM picker_settlements ps
        JOIN warehouses w ON ps.warehouse_id = w.id
        WHERE ps.status = 'paid'
          AND ps.paid_at >= p_start_date
          AND ps.paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR ps.warehouse_id = p_warehouse_id)
        UNION ALL
        SELECT 
            ds.id as "Settlement ID", 
            ds.paid_at as "Paid Date", 
            'Driver' as "Role",
            w.name as "Warehouse", 
            ds.gross_amount as "Gross Earnings",
            (ds.incentives + ds.adjustments) as "Bonus/Adjustments",
            (ds.penalties + ds.deductions) as "Deductions/Penalties",
            ds.net_amount as "Net Paid"
        FROM driver_settlements ds
        JOIN warehouses w ON ds.warehouse_id = w.id
        WHERE ds.status = 'paid'
          AND ds.paid_at >= p_start_date
          AND ds.paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR ds.warehouse_id = p_warehouse_id)
        ORDER BY "Paid Date" DESC
    ) t;

    -- 8. Warehouse Payroll
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payroll
    FROM (
        SELECT 
            wp.id as "Payroll ID",
            wp.salary_month as "Salary Month",
            p.id as "Staff ID",
            p.full_name as "Staff Name",
            w.name as "Warehouse",
            wp.base_salary as "Base Salary",
            wp.additions as "Additions/Adjustments",
            wp.deductions as "Deductions",
            wp.net_salary as "Net Salary",
            wp.status as "Status",
            wp.paid_at as "Paid Date"
        FROM warehouse_staff_payroll wp
        JOIN profiles p ON wp.staff_id = p.id
        JOIN warehouses w ON p.warehouse_id = w.id
        WHERE wp.status = 'paid'
          AND wp.paid_at >= p_start_date
          AND wp.paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id)
        ORDER BY wp.paid_at DESC
    ) t;

    -- 9. Procurement Spend
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_procurement
    FROM (
        SELECT 
            po.id as "PO ID",
            po.created_at as "Date",
            w.name as "Warehouse",
            v.name as "Supplier",
            po.status as "Status",
            po.total_cost as "Total Cost"
        FROM procurement_orders po
        JOIN vendors v ON po.vendor_id = v.id
        JOIN warehouses w ON po.warehouse_id = w.id
        WHERE po.created_at >= p_start_date
          AND po.created_at <= p_end_date
          AND (p_warehouse_id IS NULL OR po.warehouse_id = p_warehouse_id)
        ORDER BY po.created_at DESC
    ) t;

    RETURN jsonb_build_object(
        'revenue_by_date', v_revenue_by_date,
        'warehouse_performance', v_warehouse_perf,
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
