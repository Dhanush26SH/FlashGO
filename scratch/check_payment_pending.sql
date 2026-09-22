-- Check if the test customer (supabase service-role to bypass RLS) has any payment_pending orders
SELECT id, customer_id, status, created_at 
FROM public.orders
WHERE status = 'payment_pending'
ORDER BY created_at DESC
LIMIT 5;
