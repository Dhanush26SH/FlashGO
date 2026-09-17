-- Migration: 20260917084500_add_product_pack_size.sql

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pack_quantity NUMERIC(10,2) CHECK (pack_quantity > 0),
ADD COLUMN IF NOT EXISTS pack_unit TEXT CHECK (pack_unit IN ('g', 'kg', 'ml', 'L', 'pcs'));
