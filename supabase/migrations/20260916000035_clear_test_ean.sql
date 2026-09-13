-- Migration 20260916000035_clear_test_ean.sql
UPDATE public.products
SET manufacturer_barcode = NULL, manufacturer_barcode_verified = false
WHERE name ILIKE '%24 Mantra Organic Brown Rice%';
