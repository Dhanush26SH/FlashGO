-- Phase 14.5 Analytics RPCs

-- 1. Add warehouse UI fields
ALTER TABLE public.warehouses 
ADD COLUMN IF NOT EXISTS delivery_radius_meters INTEGER,
ADD COLUMN IF NOT EXISTS capacity_description TEXT;

-- 2. RPC: get_admin_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric;
  v_today_orders int;
  v_active_orders int;
  v_pending_orders int;
  v_online_drivers int;
  v_online_pickers int;
BEGIN
  -- Revenue from captured/collected payments
  SELECT COALESCE(SUM(amount), 0) INTO v_revenue 
  FROM public.payment_transactions 
  WHERE status IN ('captured', 'collected');
  
  -- Active orders
  SELECT COUNT(*) INTO v_active_orders 
  FROM public.orders 
  WHERE status NOT IN ('delivered', 'cancelled');
  
  -- Today's orders
  SELECT COUNT(*) INTO v_today_orders 
  FROM public.orders 
  WHERE created_at >= date_trunc('day', timezone('utc', now()));

  -- Pending orders
  SELECT COUNT(*) INTO v_pending_orders 
  FROM public.orders 
  WHERE status = 'placed';

  -- Online drivers/pickers
  SELECT COUNT(*) INTO v_online_drivers FROM public.profiles WHERE role = 'driver' AND is_online = true;
  SELECT COUNT(*) INTO v_online_pickers FROM public.profiles WHERE role = 'picker' AND is_online = true;

  RETURN json_build_object(
    'revenue', v_revenue,
    'active_orders', v_active_orders,
    'today_orders', v_today_orders,
    'pending_orders', v_pending_orders,
    'online_drivers', v_online_drivers,
    'online_pickers', v_online_pickers
  );
END;
$$;

-- 3. RPC: get_inventory_analytics
CREATE OR REPLACE FUNCTION public.get_inventory_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_low_stock_products json;
  v_expiry_batches json;
  v_warehouses json;
BEGIN
  -- Low stock (< 20)
  SELECT COALESCE(json_agg(p), '[]'::json) INTO v_low_stock_products
  FROM (
    SELECT id, name, stock_quantity 
    FROM public.products 
    WHERE stock_quantity < 20
    ORDER BY stock_quantity ASC
    LIMIT 50
  ) p;

  -- Near expiry batches (next 30 days)
  SELECT COALESCE(json_agg(b), '[]'::json) INTO v_expiry_batches
  FROM (
    SELECT pb.id, pb.product_id, pr.name as product_name, pb.batch_number, 
           pb.expiry_date, pb.quantity_remaining, pb.warehouse_id,
           CEIL(EXTRACT(EPOCH FROM (pb.expiry_date - now())) / 86400) as days_left
    FROM public.product_batches pb
    JOIN public.products pr ON pb.product_id = pr.id
    WHERE pb.quantity_remaining > 0 
      AND pb.expiry_date > now()
      AND pb.expiry_date <= now() + interval '30 days'
    ORDER BY pb.expiry_date ASC
  ) b;

  -- Warehouses with dynamic stats
  SELECT COALESCE(json_agg(w), '[]'::json) INTO v_warehouses
  FROM (
    SELECT 
      w.id, w.name, w.code, w.address, w.lat, w.lng, w.delivery_radius_meters as radius, w.capacity_description as capacity,
      (SELECT COUNT(*) FROM public.orders o WHERE o.warehouse_id = w.id AND o.status NOT IN ('delivered', 'cancelled')) as active_orders,
      (SELECT COUNT(*) FROM public.profiles p WHERE p.warehouse_id = w.id AND p.is_online = true AND p.role IN ('picker', 'warehouse_staff')) as online_staff
    FROM public.warehouses w
  ) w;

  RETURN json_build_object(
    'low_stock_products', v_low_stock_products,
    'expiry_batches', v_expiry_batches,
    'warehouses', v_warehouses
  );
END;
$$;

-- 4. RPC: get_finance_analytics
CREATE OR REPLACE FUNCTION public.get_finance_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cod_pending numeric;
  v_cod_collected numeric;
  v_driver_payouts numeric;
  v_platform_commission numeric;
BEGIN
  -- COD stats (assume payment_method='cod')
  SELECT COALESCE(SUM(amount), 0) INTO v_cod_pending 
  FROM public.payment_transactions 
  WHERE method = 'cod' AND status = 'pending';
  
  SELECT COALESCE(SUM(amount), 0) INTO v_cod_collected 
  FROM public.payment_transactions 
  WHERE method = 'cod' AND status = 'collected';

  -- Driver Earnings
  SELECT COALESCE(SUM(earning_amount), 0) INTO v_driver_payouts
  FROM public.driver_earnings;

  SELECT COALESCE(SUM(commission_amount), 0) INTO v_platform_commission
  FROM public.driver_earnings;

  RETURN json_build_object(
    'cod_pending', v_cod_pending,
    'cod_collected', v_cod_collected,
    'driver_payouts_total', v_driver_payouts,
    'platform_commission_total', v_platform_commission
  );
END;
$$;

-- 5. RPC: get_sales_trends
CREATE OR REPLACE FUNCTION public.get_sales_trends(p_timeframe text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_timeframe = '30days' THEN
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('day', created_at), 'Mon DD') as name,
        SUM(amount) as revenue,
        COUNT(DISTINCT order_id) as orders
      FROM public.payment_transactions
      WHERE status IN ('captured', 'collected')
        AND created_at >= date_trunc('day', now() - interval '30 days')
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at) ASC
    ) t;
  ELSIF p_timeframe = '7days' THEN
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('day', created_at), 'Dy') as name,
        SUM(amount) as revenue,
        COUNT(DISTINCT order_id) as orders
      FROM public.payment_transactions
      WHERE status IN ('captured', 'collected')
        AND created_at >= date_trunc('day', now() - interval '7 days')
      GROUP BY date_trunc('day', created_at)
      ORDER BY date_trunc('day', created_at) ASC
    ) t;
  ELSE
    SELECT COALESCE(json_agg(t), '[]'::json) INTO v_result
    FROM (
      SELECT 
        to_char(date_trunc('month', created_at), 'Mon') as name,
        SUM(amount) as revenue,
        COUNT(DISTINCT order_id) as orders
      FROM public.payment_transactions
      WHERE status IN ('captured', 'collected')
        AND created_at >= date_trunc('year', now())
      GROUP BY date_trunc('month', created_at)
      ORDER BY date_trunc('month', created_at) ASC
    ) t;
  END IF;

  RETURN v_result;
END;
$$;
