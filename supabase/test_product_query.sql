BEGIN;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "52dd620e-b6d8-4877-9caf-b3fb00877218", "role": "authenticated"}';
SELECT id, name, sku, internal_barcode FROM products WHERE id = '888f7899-2f74-4d18-a2b5-dfce6c354287';
COMMIT;
