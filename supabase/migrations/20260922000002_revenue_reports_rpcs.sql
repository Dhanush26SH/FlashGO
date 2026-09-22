-- Migration: 20260922000002_revenue_reports_rpcs.sql
-- Description: RPCs for Admin Revenue & Reports dashboard and Excel exports.

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

    -- 6. Procurement Spend
    SELECT COALESCE(SUM(total_cost), 0) INTO v_procurement_spend
    FROM procurement_orders
    WHERE created_at >= p_start_date
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

    -- Orders Sheet Data
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'date', oe.delivered_at,
            'warehouse_id', o.warehouse_id,
            'gov', o.total_amount + o.discount_amount,
            'discount', o.discount_amount,
            'net_amount', o.total_amount,
            'payment_method', o.payment_method
        )
    ), '[]'::jsonb) INTO v_orders
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

    -- Category Sales
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'category_name', cat.name,
            'net_sales', t.net_sales,
            'items_sold', t.items_sold
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
            date_trunc('day', oe.delivered_at AT TIME ZONE 'Asia/Kolkata') as date,
            SUM(CASE WHEN o.payment_method IN ('upi', 'card', 'wallet') AND o.payment_status = 'paid' THEN o.total_amount ELSE 0 END) as online_revenue,
            SUM(CASE WHEN o.payment_method = 'cod' THEN o.total_amount ELSE 0 END) as cod_revenue,
            SUM(o.wallet_applied_amount) as wallet_used
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
            'id', r.id,
            'order_id', r.order_id,
            'date', r.created_at,
            'reason', r.reason,
            'amount', r.amount
        )
    ), '[]'::jsonb) INTO v_refunds
    FROM refunds r
    JOIN orders o ON r.order_id = o.id
    WHERE r.status = 'completed'
      AND r.created_at >= p_start_date
      AND r.created_at <= p_end_date
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);

    -- Payouts
    SELECT COALESCE(jsonb_agg(row), '[]'::jsonb) INTO v_payouts
    FROM (
        SELECT 
            id as settlement_id, 
            paid_at as date, 
            warehouse_id, 
            'Picker' as role, 
            net_amount
        FROM picker_settlements
        WHERE status = 'paid'
          AND paid_at >= p_start_date
          AND paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
        UNION ALL
        SELECT 
            id as settlement_id, 
            paid_at as date, 
            warehouse_id, 
            'Driver' as role, 
            net_amount
        FROM driver_settlements
        WHERE status = 'paid'
          AND paid_at >= p_start_date
          AND paid_at <= p_end_date
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    ) t;

    -- Warehouse Payroll
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'payroll_id', wp.id,
            'salary_month', wp.salary_month,
            'staff_name', p.full_name,
            'warehouse_id', p.warehouse_id,
            'net_salary', wp.net_salary
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
            'po_id', id,
            'date', created_at,
            'warehouse_id', warehouse_id,
            'total_cost', total_cost
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
