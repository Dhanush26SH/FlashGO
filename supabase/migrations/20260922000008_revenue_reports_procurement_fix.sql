-- Migration: Fix Procurement Spend invariant
-- This aligns the Procurement Spend definition across Executive Summary and Detailed Export.
-- Statuses included: approved, partially_received, received
-- Statuses excluded: pending, cancelled, rejected

-- 1. Dashboard Summary RPC
CREATE OR REPLACE FUNCTION public.admin_get_financial_dashboard_summary(
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
    v_gov numeric := 0;
    v_net_revenue numeric := 0;
    v_delivered_orders bigint := 0;
    v_aov numeric := 0;
    v_online_revenue numeric := 0;
    v_cod_revenue numeric := 0;
    v_refunds numeric := 0;
    v_discounts numeric := 0;
    v_picker_payouts numeric := 0;
    v_driver_payouts numeric := 0;
    v_warehouse_payroll numeric := 0;
    v_procurement_spend numeric := 0;
BEGIN
    -- Verify admin role
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 1. Orders Data (GOV, Net Revenue, Delivered Orders, Online/COD Revenue, Discounts)
    -- Using the first delivered event as the deterministic timestamp
    SELECT
        COALESCE(SUM(o.total_amount + o.discount_amount), 0),
        COALESCE(SUM(o.total_amount), 0),
        COUNT(DISTINCT o.id),
        COALESCE(SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END), 0),
        COALESCE(SUM(o.discount_amount), 0)
    INTO
        v_gov,
        v_net_revenue,
        v_delivered_orders,
        v_online_revenue,
        v_cod_revenue,
        v_discounts
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
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);

    -- 2. Refunds
    SELECT COALESCE(SUM(r.amount), 0) INTO v_refunds
    FROM refunds r
    JOIN orders o ON r.order_id = o.id
    WHERE r.status = 'completed'
      AND r.created_at >= p_start_date
      AND r.created_at <= p_end_date
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);

    -- Adjust Net Revenue by subtracting Refunds
    v_net_revenue := v_net_revenue - v_refunds;

    -- AOV
    IF v_delivered_orders > 0 THEN
        v_aov := v_net_revenue / v_delivered_orders;
    END IF;

    -- 3. Picker Payouts
    SELECT COALESCE(SUM(net_amount), 0) INTO v_picker_payouts
    FROM picker_settlements
    WHERE status = 'paid'
      AND paid_at >= p_start_date
      AND paid_at <= p_end_date
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

    -- 4. Driver Payouts
    SELECT COALESCE(SUM(net_amount), 0) INTO v_driver_payouts
    FROM driver_settlements
    WHERE status = 'paid'
      AND paid_at >= p_start_date
      AND paid_at <= p_end_date
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

    -- 5. Warehouse Payroll
    -- Note: payroll is usually monthly, but we filter by paid_at if available or generated_at
    SELECT COALESCE(SUM(wp.net_salary), 0) INTO v_warehouse_payroll
    FROM warehouse_staff_payroll wp
    JOIN profiles p ON wp.staff_id = p.id
    WHERE wp.status = 'paid'
      AND wp.paid_at >= p_start_date
      AND wp.paid_at <= p_end_date
      AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

    -- 6. Procurement Spend (Invariant Fix)
    SELECT COALESCE(SUM(total_cost), 0) INTO v_procurement_spend
    FROM procurement_orders
    WHERE status IN ('approved', 'partially_received', 'received')
      AND created_at >= p_start_date
      AND created_at <= p_end_date
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

    RETURN jsonb_build_object(
        'gov', v_gov,
        'net_revenue', v_net_revenue,
        'delivered_orders', v_delivered_orders,
        'aov', v_aov,
        'online_revenue', v_online_revenue,
        'cod_revenue', v_cod_revenue,
        'refunds', v_refunds,
        'discounts', v_discounts,
        'picker_payouts', v_picker_payouts,
        'driver_payouts', v_driver_payouts,
        'warehouse_payroll', v_warehouse_payroll,
        'procurement_spend', v_procurement_spend
    );
END;
$$;

-- 2. Export Data RPC
CREATE OR REPLACE FUNCTION admin_get_financial_export_data(
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_warehouse_id uuid DEFAULT NULL
) RETURNS jsonb
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
        WITH daily_orders AS (
            SELECT 
                date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as d_date,
                SUM(o.total_amount + o.discount_amount) as gov,
                SUM(o.total_amount) as total_amount,
                COUNT(DISTINCT o.id) as delivered_orders,
                SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as online_revenue,
                SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as cod_revenue,
                SUM(o.discount_amount) as discounts
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
        ),
        daily_refunds AS (
            SELECT 
                date_trunc('day', r.created_at AT TIME ZONE 'Asia/Kolkata') as d_date,
                SUM(r.amount) as total_refund
            FROM refunds r
            JOIN orders o ON r.order_id = o.id
            WHERE r.status = 'completed'
              AND r.created_at >= p_start_date
              AND r.created_at <= p_end_date
              AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
            GROUP BY date_trunc('day', r.created_at AT TIME ZONE 'Asia/Kolkata')
        ),
        all_dates AS (
            SELECT d_date FROM daily_orders
            UNION
            SELECT d_date FROM daily_refunds
        )
        SELECT 
            ad.d_date as "Date",
            COALESCE(do_agg.gov, 0) as "GOV",
            COALESCE(do_agg.total_amount, 0) - COALESCE(dr_agg.total_refund, 0) as "Net Revenue",
            COALESCE(do_agg.delivered_orders, 0) as "Delivered Orders",
            CASE WHEN COALESCE(do_agg.delivered_orders, 0) > 0 
                 THEN (COALESCE(do_agg.total_amount, 0) - COALESCE(dr_agg.total_refund, 0)) / do_agg.delivered_orders 
                 ELSE 0 END as "AOV",
            COALESCE(do_agg.online_revenue, 0) as "Online Revenue",
            COALESCE(do_agg.cod_revenue, 0) as "COD Revenue",
            COALESCE(dr_agg.total_refund, 0) as "Refunds",
            COALESCE(do_agg.discounts, 0) as "Discounts"
        FROM all_dates ad
        LEFT JOIN daily_orders do_agg ON do_agg.d_date = ad.d_date
        LEFT JOIN daily_refunds dr_agg ON dr_agg.d_date = ad.d_date
        ORDER BY "Date"
    ) t;

    -- 2. Warehouse Performance
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_warehouse_perf
    FROM (
        WITH wh_orders AS (
            SELECT 
                o.warehouse_id,
                w.name as warehouse_name,
                SUM(o.total_amount + o.discount_amount) as gov,
                SUM(o.total_amount) as total_amount,
                COUNT(DISTINCT o.id) as delivered_orders,
                SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as online_revenue,
                SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as cod_revenue,
                SUM(o.discount_amount) as discounts
            FROM orders o
            JOIN (
                SELECT order_id, MIN(created_at) as delivered_at
                FROM order_events
                WHERE new_status = 'delivered'
                GROUP BY order_id
            ) oe ON oe.order_id = o.id
            JOIN warehouses w ON w.id = o.warehouse_id
            WHERE o.status = 'delivered'
              AND oe.delivered_at >= p_start_date
              AND oe.delivered_at <= p_end_date
              AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
            GROUP BY o.warehouse_id, w.name
        ),
        wh_refunds AS (
            SELECT 
                o.warehouse_id,
                SUM(r.amount) as total_refund
            FROM refunds r
            JOIN orders o ON r.order_id = o.id
            WHERE r.status = 'completed'
              AND r.created_at >= p_start_date
              AND r.created_at <= p_end_date
              AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
            GROUP BY o.warehouse_id
        ),
        all_wh AS (
            SELECT warehouse_id, warehouse_name FROM wh_orders
            UNION
            SELECT wr.warehouse_id, w.name FROM wh_refunds wr JOIN warehouses w ON w.id = wr.warehouse_id
        )
        SELECT 
            aw.warehouse_name as "Warehouse",
            COALESCE(wo.gov, 0) as "GOV",
            COALESCE(wo.total_amount, 0) - COALESCE(wr.total_refund, 0) as "Net Revenue",
            COALESCE(wo.delivered_orders, 0) as "Delivered Orders",
            CASE WHEN COALESCE(wo.delivered_orders, 0) > 0 
                 THEN (COALESCE(wo.total_amount, 0) - COALESCE(wr.total_refund, 0)) / wo.delivered_orders 
                 ELSE 0 END as "AOV",
            COALESCE(wo.online_revenue, 0) as "Online Revenue",
            COALESCE(wo.cod_revenue, 0) as "COD Revenue",
            COALESCE(wr.total_refund, 0) as "Refunds",
            COALESCE(wo.discounts, 0) as "Discounts"
        FROM all_wh aw
        LEFT JOIN wh_orders wo ON wo.warehouse_id = aw.warehouse_id
        LEFT JOIN wh_refunds wr ON wr.warehouse_id = aw.warehouse_id
        ORDER BY "Net Revenue" DESC
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

    -- 9. Procurement Spend (Invariant Fix)
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
        JOIN warehouses w ON w.id = po.warehouse_id
        JOIN vendors v ON v.id = po.vendor_id
        WHERE po.status IN ('approved', 'partially_received', 'received')
          AND po.created_at >= p_start_date
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
