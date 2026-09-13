-- Migration: 20260916000080_internal_product_barcodes.sql
-- Add internal_barcode to products, sequence, backfill, and validation

-- 1. Add the column allowing NULL temporarily for the backfill
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS internal_barcode TEXT UNIQUE CHECK (internal_barcode ~ '^FLH[0-9]{6}$');

-- 2. Create the sequence with safety limits
CREATE SEQUENCE IF NOT EXISTS public.flashgo_barcode_seq 
START 100001 
MAXVALUE 999999;

-- 3. Backfill existing products
DO $$
DECLARE
    v_product RECORD;
    v_new_barcode TEXT;
BEGIN
    FOR v_product IN 
        SELECT id FROM public.products WHERE internal_barcode IS NULL
    LOOP
        v_new_barcode := 'FLH' || nextval('public.flashgo_barcode_seq');
        UPDATE public.products 
        SET internal_barcode = v_new_barcode 
        WHERE id = v_product.id;
    END LOOP;
END $$;

-- 4. Enforce NOT NULL and add default for new products
ALTER TABLE public.products 
ALTER COLUMN internal_barcode SET NOT NULL,
ALTER COLUMN internal_barcode SET DEFAULT 'FLH' || nextval('public.flashgo_barcode_seq');
