SELECT tgname, proname 
FROM pg_trigger 
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid 
WHERE proname = 'process_order_cancellation';
