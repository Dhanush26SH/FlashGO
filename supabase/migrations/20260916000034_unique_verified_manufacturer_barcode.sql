-- Migration 20260916000034_unique_verified_manufacturer_barcode.sql
-- Ensure verified manufacturer barcodes are strictly unique per variant

CREATE UNIQUE INDEX IF NOT EXISTS unique_verified_manufacturer_barcode 
ON public.products (manufacturer_barcode) 
WHERE manufacturer_barcode_verified = true AND manufacturer_barcode IS NOT NULL;
