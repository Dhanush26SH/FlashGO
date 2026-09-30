-- Migration: 20260930000000_fix_admin_online_drivers_count.sql
-- Purpose: Fix get_admin_dashboard_stats online_drivers count to use authoritative
--          operational state (driver_sessions + staff_shifts) instead of profiles.is_online alone.
--
-- OLD (incorrect):
--   SELECT COUNT(*) FROM public.profiles
--   WHERE role = 'driver' AND is_online = true
--   AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
--
-- NEW (authoritative):
--   COUNT(DISTINCT ds.driver_id) where:
--     profiles.role = 'driver' AND profiles.is_online = true
--     AND driver_sessions.status = 'active'
--     AND staff_shifts.status = 'active' AND staff_shifts.shift_end > NOW()
--     AND optional p_warehouse_id filter applies.
--
-- All other calculations in get_admin_dashboard_stats are unchanged.
-- Picker counting is NOT changed (separate investigation required first).

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

  -- 2. Compute Metrics (unchanged from previous version except online_drivers)

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

  -- ============================================================
  -- Online drivers — AUTHORITATIVE OPERATIONAL DEFINITION
  -- A Driver is Online only when:
  --   1. profiles.is_online = true (driver has not been force-offlined)
  --   2. An active driver_sessions row exists for this driver
  --   3. The linked staff_shift is status = 'active' AND shift_end > NOW()
  --   4. Warehouse filter respected via profiles.warehouse_id
  -- DISTINCT prevents any edge-case double-count from multiple session rows.
  -- ============================================================
  SELECT COUNT(DISTINCT ds.driver_id) INTO v_online_drivers
  FROM public.driver_sessions ds
  JOIN public.profiles p ON p.id = ds.driver_id
  JOIN public.staff_shifts ss ON ss.id = ds.staff_shift_id
  WHERE ds.status = 'active'
    AND p.role = 'driver'
    AND p.is_online = true
    AND ss.status = 'active'
    AND ss.shift_end > now()
    AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

  -- Busy drivers (have an active out_for_delivery order) — unchanged
  SELECT COUNT(DISTINCT p.id) INTO v_busy_drivers
  FROM public.profiles p
  JOIN public.orders o ON o.driver_id = p.id
  WHERE p.role = 'driver' AND p.is_online = true
    AND o.status = 'out_for_delivery'
    AND (p_warehouse_id IS NULL OR p.warehouse_id = p_warehouse_id);

  -- Online pickers — unchanged (profiles.is_online, separate investigation pending)
  SELECT COUNT(*) INTO v_online_pickers
  FROM public.profiles
  WHERE role = 'picker' AND is_online = true
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  -- Busy pickers — unchanged
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

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(UUID) TO authenticated;
