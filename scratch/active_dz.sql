SELECT 
    dza.id AS allocation_id,
    dza.status AS allocation_status,
    dza.created_at AS allocated_at,
    dza.placed_at,
    dza.picked_up_at,
    dza.driver_assigned_at,
    dz.zone_code,
    dz.is_active,
    o.id AS order_id, 
    o.status AS order_status,
    p1.full_name AS picker_name
FROM public.drop_zone_allocations dza
LEFT JOIN public.drop_zones dz ON dz.id = dza.drop_zone_id
LEFT JOIN public.orders o ON o.id = dza.order_id
LEFT JOIN public.profiles p1 ON p1.id = dza.picker_id
WHERE dza.status != 'voided' AND dza.status != 'picked_up';
