SELECT 
  dza.id AS allocation_id,
  dz.zone_code,
  dza.status AS allocation_status,
  dza.order_id,
  dza.trip_id,
  dza.picker_id,
  dza.driver_id,
  dza.placed_at,
  dza.driver_assigned_at,
  dza.picked_up_at,
  dza.created_at,
  o.order_number,
  o.status AS order_status,
  lt.status AS trip_status,
  lt.driver_id AS trip_driver,
  lt.delivered_at
FROM public.drop_zone_allocations dza
JOIN public.drop_zones dz ON dz.id = dza.drop_zone_id
JOIN public.orders o ON o.id = dza.order_id
JOIN public.logistics_trips lt ON lt.id = dza.trip_id
WHERE dz.zone_code IN ('G1', 'G2');
