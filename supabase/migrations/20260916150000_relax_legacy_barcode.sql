-- Migration: 20260916150000_relax_legacy_barcode.sql
-- Remove NOT NULL constraint from obsolete legacy internal_sku_barcode
-- to allow new product inserts to succeed via admin_create_product.
-- Authoritative barcode generation relies on internal_barcode (FLH sequence).

ALTER TABLE public.products 
ALTER COLUMN internal_sku_barcode DROP NOT NULL;
