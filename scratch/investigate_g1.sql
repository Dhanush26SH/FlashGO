SELECT 
    o.id AS order_id, 
    o.status AS order_status,
    o.picker_id, 
    p1.full_name AS picker_name,
    o.driver_id,
    p2.full_name AS driver_name,
    o.trip_id,
    dz.id AS drop_zone_id,
    dz.zone_code AS drop_zone_code,
    dz.is_active,
    dza.status AS allocation_status,
    dza.created_at AS allocated_at,
    dza.placed_at,
    dza.picked_up_at,
    dza.driver_assigned_at,
    o.created_at AS order_created,
    o.updated_at AS order_updated
FROM public.orders o
LEFT JOIN public.profiles p1 ON p1.id = o.picker_id
LEFT JOIN public.profiles p2 ON p2.id = o.driver_id
LEFT JOIN public.drop_zone_allocations dza ON dza.order_id = o.id
LEFT JOIN public.drop_zones dz ON dz.id = dza.drop_zone_id
WHERE UPPER(o.id::text) LIKE '%AE4A9';
