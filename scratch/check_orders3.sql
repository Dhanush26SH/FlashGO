SELECT 
    o.id AS order_id, 
    o.customer_id, 
    o.customer_snapshot_name,
    o.customer_snapshot_phone,
    p.full_name AS profile_name,
    p.phone AS profile_phone
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.customer_id
WHERE UPPER(o.id::text) LIKE '%83AC10' 
   OR UPPER(o.id::text) LIKE '%19BB5E' 
   OR UPPER(o.id::text) LIKE '%1C36FC';
