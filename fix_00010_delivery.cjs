const fs = require('fs');

let file = 'supabase/migrations/20260902000010_phase24_analytics_fixes.sql';
let text = fs.readFileSync(file, 'utf8');

let deliveryPerformanceRPC = `
-- 4. Delivery Performance RPC Fix (Removed unsupported timing metrics)
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
BEGIN
  -- Authorization Check
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_start := p_start_date::timestamp with time zone;
  v_end := p_end_date::timestamp with time zone;

  IF v_start > v_end THEN
    RAISE EXCEPTION 'Invalid date range: start date must be before or equal to end date';
  END IF;

  SELECT COUNT(id) INTO v_total_delivered
  FROM public.orders
  WHERE status = 'delivered'
    AND created_at >= v_start
    AND created_at <= v_end
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  v_result := json_build_object(
    'completed_deliveries', v_total_delivered
  );

  RETURN v_result;
END;
$BODY$;
`;

text += "\n" + deliveryPerformanceRPC;

fs.writeFileSync(file, text);
console.log('Added corrected get_delivery_performance to 00010.');
