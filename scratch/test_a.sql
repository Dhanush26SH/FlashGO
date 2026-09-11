BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"718a6efa-7364-44bd-b0c9-2106e44585c3", "role":"authenticated"}', true);
SELECT count(*) as test_a_count FROM public.orders WHERE picker_id = '718a6efa-7364-44bd-b0c9-2106e44585c3';
COMMIT;
