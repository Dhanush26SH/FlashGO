SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'create_picker_settlement_batch';
