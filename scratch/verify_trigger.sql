SELECT tgname, event_manipulation, action_timing, action_statement, action_condition
FROM information_schema.triggers 
WHERE event_object_table = 'orders' AND trigger_name = 'trigger_process_order_cancellation';
