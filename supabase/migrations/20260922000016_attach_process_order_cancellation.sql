-- Migration: 20260922000016_attach_process_order_cancellation.sql
-- Description: Attach missing process_order_cancellation trigger to fix stale drop zone allocations and restore inventory provenance on cancellation

-- 1. Safely attach the missing trigger to public.orders
DROP TRIGGER IF EXISTS trigger_process_order_cancellation ON public.orders;
CREATE TRIGGER trigger_process_order_cancellation
BEFORE UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
EXECUTE FUNCTION public.process_order_cancellation();

-- 2. Conservatively repair existing stale Drop Zone allocations
UPDATE public.drop_zone_allocations dza
SET status = 'voided'
FROM public.orders o
WHERE dza.order_id = o.id 
  AND o.status = 'cancelled' 
  AND dza.status IN ('allocated', 'placed', 'driver_assigned');
