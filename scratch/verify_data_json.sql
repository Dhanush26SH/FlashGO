SELECT json_build_object(
  'ae4a9_status', (
    SELECT json_build_object('order_status', o.status, 'allocation_status', dza.status, 'zone_code', dz.zone_code)
    FROM public.orders o
    JOIN public.drop_zone_allocations dza ON o.id = dza.order_id
    JOIN public.drop_zones dz ON dza.drop_zone_id = dz.id
    WHERE o.order_number = 'FG-20260921-AE4A9'
  ),
  'voided_allocations_count', (
    SELECT COUNT(*) 
    FROM public.drop_zone_allocations dza
    JOIN public.orders o ON dza.order_id = o.id
    WHERE o.status = 'cancelled' AND dza.status = 'voided'
  ),
  'g1_active_allocations_count', (
    SELECT COUNT(*)
    FROM public.drop_zone_allocations dza
    JOIN public.drop_zones dz ON dza.drop_zone_id = dz.id
    WHERE dz.zone_code = 'G1' AND dza.status IN ('allocated', 'placed', 'driver_assigned')
  )
) as result;
