-- Migration: 20260902000009_phase24_analytics.sql

-- 1. Product Performance RPC
CREATE OR REPLACE FUNCTION public.get_product_performance(p_start_date text, p_end_date text, p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_role public.user_role;
  v_result json;
  v_start TIMESTAMP WITH TIME ZONE;
  v_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_start := p_start_date::timestamp with time zone;
  v_end := p_end_date::timestamp with time zone;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
  FROM (
    SELECT 
      p.id AS product_id,
      p.name AS product_name,
      c.name AS category_name,
      SUM(oi.quantity) AS units_sold,
      SUM(oi.quantity * oi.price) AS revenue,
      COUNT(DISTINCT o.id) AS order_count
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    JOIN public.products p ON oi.product_id = p.id
    LEFT JOIN public.categories c ON p.category_id = c.id
    WHERE o.status = 'delivered'
      AND o.created_at >= v_start
      AND o.created_at <= v_end
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      AND pt.status = 'paid'
    GROUP BY p.id, p.name, c.name
    ORDER BY units_sold DESC
    LIMIT 50
  ) t;

  RETURN v_result;
END;
$BODY$;

-- 2. Delivery Performance RPC
CREATE OR REPLACE FUNCTION public.get_delivery_performance(p_start_date text, p_end_date text, p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_role public.user_role;
  v_result json;
  v_start TIMESTAMP WITH TIME ZONE;
  v_end TIMESTAMP WITH TIME ZONE;
  v_total_delivered INTEGER;
  v_avg_fulfillment_seconds NUMERIC;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_start := p_start_date::timestamp with time zone;
  v_end := p_end_date::timestamp with time zone;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  -- End-to-end time uses updated_at minus created_at for 'delivered' orders.
  -- Detailed picking/packing timestamps are NOT supported by schema.
  SELECT 
    COUNT(id),
    COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))), 0)
  INTO v_total_delivered, v_avg_fulfillment_seconds
  FROM public.orders
  WHERE status = 'delivered'
    AND created_at >= v_start
    AND created_at <= v_end
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  v_result := json_build_object(
    'completed_deliveries', v_total_delivered,
    'avg_fulfillment_time_seconds', v_avg_fulfillment_seconds
  );

  RETURN v_result;
END;
$BODY$;

-- 3. Financial Ledger Export RPC
CREATE OR REPLACE FUNCTION public.get_financial_ledger_export(p_start_date text, p_end_date text, p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  v_role public.user_role;
  v_result json;
  v_start TIMESTAMP WITH TIME ZONE;
  v_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_start := p_start_date::timestamp with time zone;
  v_end := p_end_date::timestamp with time zone;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
  FROM (
    SELECT 
      o.id AS order_id,
      pt.created_at AS transaction_date,
      w.name AS warehouse_name,
      o.customer_id,
      (o.total_amount - o.delivery_fee + o.discount_amount) AS subtotal,
      o.delivery_fee,
      o.discount_amount,
      o.total_amount AS final_total,
      pt.method AS payment_method,
      pt.status AS payment_status,
      o.status AS order_status
    FROM public.payment_transactions pt
    JOIN public.orders o ON pt.order_id = o.id
    LEFT JOIN public.warehouses w ON o.warehouse_id = w.id
    WHERE pt.created_at >= v_start
      AND pt.created_at <= v_end
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      AND pt.status = 'paid'
    ORDER BY pt.created_at DESC
  ) t;

  RETURN v_result;
END;
$BODY$;
