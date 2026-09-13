-- 20260916000064_drop_debug_states.sql
-- Remove unrestricted debug RPCs to maintain production security posture

DROP FUNCTION IF EXISTS public.debug_get_orders();
DROP FUNCTION IF EXISTS public.debug_get_trips();
