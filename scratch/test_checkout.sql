BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"b78e9b9e-1641-4ebe-9957-021dd966a9b2", "role":"authenticated"}', true);
SELECT public.process_checkout('b78e9b9e-1641-4ebe-9957-021dd966a9b2'::uuid, 'Test Address Udupi', 'standard', 'cod', '[{"productId": "ce22a7e6-c7a6-46bd-867c-1f9f6fd8794e", "quantity": 2}]'::jsonb, NULL, 13.3409, 74.7421, 'idempotency_xyz123');
COMMIT;
