-- Fix orders per hour timezone precedence bug
CREATE OR REPLACE FUNCTION public.get_orders_per_hour(p_warehouse_id UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
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
      SELECT (generate_series(
        ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp,
        ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp + interval '23 hours',
        interval '1 hour'
      )) AT TIME ZONE 'Asia/Kolkata' AS h
    )
    SELECT 
      to_char(hours.h AT TIME ZONE 'Asia/Kolkata', 'FMHH12 AM') as hour,
      COALESCE(COUNT(o.id), 0) as orders
    FROM hours
    LEFT JOIN public.orders o 
      ON o.created_at >= hours.h 
      AND o.created_at < hours.h + interval '1 hour'
      AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    GROUP BY hours.h
    ORDER BY hours.h ASC
  ) t;

  RETURN v_result;
END;
$BODY$;
