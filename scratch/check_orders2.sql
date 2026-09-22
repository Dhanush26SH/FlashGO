SELECT 
    id, customer_id, 
    (SELECT full_name FROM profiles WHERE profiles.id = orders.customer_id) AS profile_name,
    customer_snapshot_name,
    customer_snapshot_phone,
    address_snapshot_formatted,
    customer_info->>'name' as customer_info_name,
    delivery_details->>'contact_name' as delivery_name
FROM orders 
WHERE UPPER(id::text) LIKE '%83AC10' 
   OR UPPER(id::text) LIKE '%19BB5E' 
   OR UPPER(id::text) LIKE '%1C36FC';
