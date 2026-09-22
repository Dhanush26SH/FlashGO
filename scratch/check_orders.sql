SELECT 
    id, display_id, user_id, 
    (SELECT full_name FROM profiles WHERE profiles.id = orders.user_id) AS profile_name,
    customer_info->>'name' as customer_info_name,
    delivery_details->>'contact_name' as delivery_name
FROM orders 
WHERE display_id IN ('83AC10', '19BB5E', '1C36FC');
