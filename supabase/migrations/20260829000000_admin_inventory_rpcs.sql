-- 20260829000000_admin_inventory_rpcs.sql
-- Admin Dark Stores & Stock RPCs

-- 1. admin_get_warehouse_inventory
-- Fetches physical, reserved, and sellable stock per product for a given warehouse.
CREATE OR REPLACE FUNCTION public.admin_get_warehouse_inventory(p_warehouse_id UUID)
RETURNS TABLE (
    product_id UUID,
    sku TEXT,
    name TEXT,
    image_url TEXT,
    price NUMERIC,
    physical_stock INT,
    reserved_stock INT,
    sellable_stock INT,
    is_low_stock BOOLEAN
) AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    -- Auth check
    SELECT (role IN ('admin')) INTO v_is_admin 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can access this data';
    END IF;

    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.sku,
        p.name,
        p.image_url,
        p.price,
        COALESCE(ws.quantity, 0) AS physical_stock,
        COALESCE((
            SELECT SUM(ir.quantity)::INT 
            FROM public.inventory_reservations ir 
            WHERE ir.warehouse_id = p_warehouse_id 
              AND ir.product_id = p.id 
              AND ir.status = 'reserved'
        ), 0) AS reserved_stock,
        public.get_sellable_quantity(p_warehouse_id, p.id) AS sellable_stock,
        (public.get_sellable_quantity(p_warehouse_id, p.id) < 20) AS is_low_stock
    FROM public.products p
    LEFT JOIN public.warehouse_stock ws ON ws.product_id = p.id AND ws.warehouse_id = p_warehouse_id
    ORDER BY p.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_get_warehouse_inventory(UUID) TO authenticated;


-- 2. admin_get_stock_ledgers
-- Fetches read-only movement history from the authoritative ledger, gracefully handling nulls.
CREATE OR REPLACE FUNCTION public.admin_get_stock_ledgers(p_warehouse_id UUID)
RETURNS TABLE (
    ledger_id UUID,
    product_id UUID,
    product_name TEXT,
    product_sku TEXT,
    quantity_change INT,
    reason TEXT,
    batch_number TEXT,
    created_at TIMESTAMPTZ,
    actor_email TEXT
) AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    -- Auth check
    SELECT (role IN ('admin')) INTO v_is_admin 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can access this data';
    END IF;

    RETURN QUERY
    SELECT 
        sl.id AS ledger_id,
        sl.product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        sl.quantity_change,
        sl.reason,
        pb.batch_number,
        sl.created_at,
        u.email::TEXT AS actor_email
    FROM public.stock_ledgers sl
    JOIN public.products p ON p.id = sl.product_id
    LEFT JOIN public.product_batches pb ON pb.id = sl.batch_id
    LEFT JOIN auth.users u ON u.id = sl.performed_by
    WHERE sl.warehouse_id = p_warehouse_id
    ORDER BY sl.created_at DESC
    LIMIT 500;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_get_stock_ledgers(UUID) TO authenticated;


-- 3. admin_get_product_batches
-- Fetches real batch data and derives damaged/expired quantity from ledgers.
CREATE OR REPLACE FUNCTION public.admin_get_product_batches(p_warehouse_id UUID)
RETURNS TABLE (
    batch_id UUID,
    product_id UUID,
    product_name TEXT,
    batch_number TEXT,
    expiry_date DATE,
    received_quantity INT,
    available_quantity INT,
    status TEXT,
    days_left INT,
    damaged_quantity INT,
    expired_quantity INT
) AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    -- Auth check
    SELECT (role IN ('admin')) INTO v_is_admin 
    FROM public.profiles 
    WHERE id = auth.uid();

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can access this data';
    END IF;

    RETURN QUERY
    SELECT 
        pb.id AS batch_id,
        pb.product_id,
        p.name AS product_name,
        pb.batch_number,
        pb.expiry_date,
        pb.received_quantity,
        pb.available_quantity,
        pb.status,
        CEIL(EXTRACT(EPOCH FROM (pb.expiry_date - now())) / 86400)::INT as days_left,
        COALESCE((
            SELECT SUM(ABS(quantity_change))::INT
            FROM public.stock_ledgers sl
            WHERE sl.batch_id = pb.id AND sl.reason IN ('damaged', 'damage')
        ), 0) AS damaged_quantity,
        COALESCE((
            SELECT SUM(ABS(quantity_change))::INT
            FROM public.stock_ledgers sl
            WHERE sl.batch_id = pb.id AND sl.reason IN ('expired', 'expiry')
        ), 0) AS expired_quantity
    FROM public.product_batches pb
    JOIN public.products p ON pb.product_id = p.id
    WHERE pb.warehouse_id = p_warehouse_id
    ORDER BY pb.expiry_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.admin_get_product_batches(UUID) TO authenticated;


-- 4. Fix get_dashboard_inventory_alerts logic
-- Replace SUM(pb.quantity_remaining) with a correct call to get_sellable_quantity (global aggregation).
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
        COALESCE((SELECT SUM(quantity) FROM public.warehouse_stock WHERE product_id = p.id), 0) - COALESCE((SELECT SUM(quantity) FROM public.inventory_reservations WHERE product_id = p.id AND status = 'reserved'), 0) as stock_quantity
      FROM public.products p
      WHERE (COALESCE((SELECT SUM(quantity) FROM public.warehouse_stock WHERE product_id = p.id), 0) - COALESCE((SELECT SUM(quantity) FROM public.inventory_reservations WHERE product_id = p.id AND status = 'reserved'), 0)) < 20
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
