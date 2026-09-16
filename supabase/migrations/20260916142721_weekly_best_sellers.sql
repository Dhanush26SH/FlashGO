-- Migration: 20260916142721_weekly_best_sellers.sql

CREATE OR REPLACE FUNCTION public.get_weekly_best_sellers(p_warehouse_id uuid)
RETURNS TABLE (
    product_id UUID,
    total_sold BIGINT
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    ist_monday_midnight timestamptz;
BEGIN
    -- Require authenticated user
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Calculate current time in IST, truncate to week (Monday 00:00:00), cast back to timestamptz
    ist_monday_midnight := (date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');

    RETURN QUERY
    SELECT oi.product_id, SUM(oi.quantity) as total_sold
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'delivered'
      AND o.warehouse_id = p_warehouse_id
      AND o.created_at >= ist_monday_midnight
    GROUP BY oi.product_id
    ORDER BY total_sold DESC
    LIMIT 12;
END;
$$;

-- Grant execution to authenticated role
REVOKE ALL ON FUNCTION public.get_weekly_best_sellers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_best_sellers(uuid) TO authenticated;
