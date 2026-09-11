-- 20260828000000_secure_admin_analytics.sql

-- 1. Secure get_admin_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_user_warehouse_id UUID;
  v_revenue numeric;
  v_today_orders int;
  v_active_orders int;
  v_pending_orders int;
  v_online_drivers int;
  v_busy_drivers int;
  v_online_pickers int;
  v_busy_pickers int;
  v_attention_orders int;
BEGIN
  -- 1. Authorization Check
  SELECT role, warehouse_id INTO v_role, v_user_warehouse_id 
  FROM public.profiles WHERE id = auth.uid();

  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Compute Metrics
  -- Revenue
  SELECT COALESCE(SUM(pt.amount), 0) INTO v_revenue 
  FROM public.payment_transactions pt
  JOIN public.orders o ON pt.order_id = o.id
  WHERE pt.status IN ('captured', 'collected')
    AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id);
  
  -- Active orders
  SELECT COUNT(*) INTO v_active_orders 
  FROM public.orders 
  WHERE status NOT IN ('delivered', 'cancelled')
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
  
  -- Today's orders
  SELECT COUNT(*) INTO v_today_orders 
  FROM public.orders 
  WHERE created_at >= date_trunc('day', timezone('utc', now()))
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  -- Pending orders
  SELECT COUNT(*) INTO v_pending_orders 
  FROM public.orders 
  WHERE status = 'placed'
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  -- Orders requiring attention (older than 20 mins and not delivered/cancelled)
  SELECT COUNT(*) INTO v_attention_orders
  FROM public.orders
  WHERE status NOT IN ('delivered', 'cancelled')
    AND created_at < now() - interval '20 minutes'
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  -- Online/Busy drivers
  SELECT COUNT(*) INTO v_online_drivers 
  FROM public.profiles 
  WHERE role = 'driver' AND is_online = true
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  -- Busy drivers (have an active trip or an out_for_delivery order)
  SELECT COUNT(DISTINCT p.id) INTO v_busy_drivers
  FROM public.profiles p
  JOIN public.orders o ON o.driver_id = p.id
  WHERE p.role = 'driver' AND p.is_online = true
    AND o.status = 'out_for_delivery'
    AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

  -- Online/Busy pickers
  SELECT COUNT(*) INTO v_online_pickers 
  FROM public.profiles 
  WHERE role = 'picker' AND is_online = true
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  SELECT COUNT(DISTINCT p.id) INTO v_busy_pickers
  FROM public.profiles p
  JOIN public.orders o ON o.picker_id = p.id
  WHERE p.role = 'picker' AND p.is_online = true
    AND o.status = 'picking'
    AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

  RETURN json_build_object(
    'revenue', v_revenue,
    'active_orders', v_active_orders,
    'today_orders', v_today_orders,
    'pending_orders', v_pending_orders,
    'attention_orders', v_attention_orders,
    'online_drivers', v_online_drivers,
    'busy_drivers', v_busy_drivers,
    'online_pickers', v_online_pickers,
    'busy_pickers', v_busy_pickers
  );
END;
$$;


-- 2. Secure get_sales_trends
CREATE OR REPLACE FUNCTION public.get_sales_trends(p_timeframe text, p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_result json;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_timeframe = '30days' THEN
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('day', pt.created_at), 'Mon DD') as name,
        SUM(pt.amount) as revenue,
        COUNT(DISTINCT pt.order_id) as orders
      FROM public.payment_transactions pt
      JOIN public.orders o ON pt.order_id = o.id
      WHERE pt.status IN ('captured', 'collected')
        AND pt.created_at >= date_trunc('day', now() - interval '30 days')
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      GROUP BY date_trunc('day', pt.created_at)
      ORDER BY date_trunc('day', pt.created_at) ASC
    ) t;
  ELSIF p_timeframe = '7days' THEN
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('day', pt.created_at), 'Dy') as name,
        SUM(pt.amount) as revenue,
        COUNT(DISTINCT pt.order_id) as orders
      FROM public.payment_transactions pt
      JOIN public.orders o ON pt.order_id = o.id
      WHERE pt.status IN ('captured', 'collected')
        AND pt.created_at >= date_trunc('day', now() - interval '7 days')
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      GROUP BY date_trunc('day', pt.created_at)
      ORDER BY date_trunc('day', pt.created_at) ASC
    ) t;
  ELSE
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('month', pt.created_at), 'Mon') as name,
        SUM(pt.amount) as revenue,
        COUNT(DISTINCT pt.order_id) as orders
      FROM public.payment_transactions pt
      JOIN public.orders o ON pt.order_id = o.id
      WHERE pt.status IN ('captured', 'collected')
        AND pt.created_at >= date_trunc('year', now())
        AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
      GROUP BY date_trunc('month', pt.created_at)
      ORDER BY date_trunc('month', pt.created_at) ASC
    ) t;
  END IF;

  RETURN v_result;
END;
$$;


-- 3. Secure get_orders_per_hour
CREATE OR REPLACE FUNCTION public.get_orders_per_hour(p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_result json;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
  FROM (
    WITH hours AS (
      SELECT generate_series(
        date_trunc('day', now()), 
        date_trunc('day', now()) + interval '23 hours', 
        interval '1 hour'
      ) AS h
    )
    SELECT 
      to_char(hours.h, 'ha') as hour,
      COALESCE(COUNT(o.id), 0) as orders
    FROM hours
    LEFT JOIN public.orders o 
      ON date_trunc('hour', o.created_at) = hours.h
      AND o.created_at >= date_trunc('day', now())
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    GROUP BY hours.h
    ORDER BY hours.h ASC
  ) t;

  RETURN v_result;
END;
$$;


-- 4. Secure get_dashboard_inventory_alerts
CREATE OR REPLACE FUNCTION public.get_dashboard_inventory_alerts(p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_result json;
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Return top 10 low stock items based on actual sellable quantity
  -- If p_warehouse_id is NULL, we aggregate globally, else specific warehouse
  IF p_warehouse_id IS NULL THEN
    SELECT COALESCE(json_agg(alert), '[]'::json) INTO v_result
    FROM (
      SELECT 
        p.id, 
        p.name, 
        COALESCE(SUM(pb.quantity_remaining), 0) as stock_quantity
      FROM public.products p
      LEFT JOIN public.product_batches pb ON p.id = pb.product_id AND pb.expiry_date > now()
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(pb.quantity_remaining), 0) < 20
      ORDER BY stock_quantity ASC
      LIMIT 10
    ) alert;
  ELSE
    SELECT COALESCE(json_agg(alert), '[]'::json) INTO v_result
    FROM (
      SELECT 
        p.id, 
        p.name, 
        public.get_sellable_quantity(p_warehouse_id, p.id) as stock_quantity
      FROM public.products p
      WHERE public.get_sellable_quantity(p_warehouse_id, p.id) < 20
      ORDER BY stock_quantity ASC
      LIMIT 10
    ) alert;
  END IF;

  RETURN v_result;
END;
$$;
