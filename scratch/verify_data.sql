-- 1. Check #AE4A9
SELECT o.status AS order_status, dza.status AS allocation_status, dz.zone_code
FROM public.orders o
JOIN public.drop_zone_allocations dza ON o.id = dza.order_id
JOIN public.drop_zones dz ON dza.drop_zone_id = dz.id
WHERE o.order_number = 'FG-20260921-AE4A9';

-- 2. Count voided stale allocations
SELECT COUNT(*) 
FROM public.drop_zone_allocations dza
JOIN public.orders o ON dza.order_id = o.id
WHERE o.status = 'cancelled' AND dza.status = 'voided';

-- 3. Check for any remaining active allocations on G1
SELECT COUNT(*)
FROM public.drop_zone_allocations dza
JOIN public.drop_zones dz ON dza.drop_zone_id = dz.id
WHERE dz.zone_code = 'G1' AND dza.status IN ('allocated', 'placed', 'driver_assigned');
