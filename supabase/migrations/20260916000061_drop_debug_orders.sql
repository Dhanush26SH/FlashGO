-- 20260916000061_drop_debug_orders.sql
-- Remove unrestricted debug RPCs to maintain production security posture

DROP FUNCTION IF EXISTS public.debug_get_orders();
DROP FUNCTION IF EXISTS public.debug_get_trips();
