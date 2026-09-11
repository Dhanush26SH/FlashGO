BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"718a6efa-7364-44bd-b0c9-2106e44585c3", "role":"authenticated"}', true);
UPDATE public.profiles SET is_online = true WHERE id = '718a6efa-7364-44bd-b0c9-2106e44585c3' RETURNING id, is_online;
COMMIT;
