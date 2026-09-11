BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"718a6efa-7364-44bd-b0c9-2106e44585c3", "role":"authenticated"}', true);

-- A) All orders for Bob
SELECT count(*) as "Test A count" FROM public.orders WHERE picker_id = '718a6efa-7364-44bd-b0c9-2106e44585c3';

-- B) Placed/Picking orders for Bob
SELECT count(*) as "Test B count" FROM public.orders WHERE picker_id = '718a6efa-7364-44bd-b0c9-2106e44585c3' AND status IN ('placed', 'picking');

-- C) Exact SELECT currently used
SELECT id, status, bag_number, warehouse_id, (SELECT count(*) FROM public.order_items WHERE order_id = orders.id) as order_items_count 
FROM public.orders 
WHERE picker_id = '718a6efa-7364-44bd-b0c9-2106e44585c3' AND status IN ('placed', 'picking');

-- E) Online Toggle
UPDATE public.profiles SET is_online = true WHERE id = '718a6efa-7364-44bd-b0c9-2106e44585c3' RETURNING id, is_online;

COMMIT;
