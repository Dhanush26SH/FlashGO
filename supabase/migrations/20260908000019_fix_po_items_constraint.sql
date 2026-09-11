-- 20260908000019_fix_po_items_constraint.sql

-- Add missing unique constraint for admin_create_po upsert logic
ALTER TABLE public.procurement_order_items
DROP CONSTRAINT IF EXISTS procurement_order_items_po_product_key;

ALTER TABLE public.procurement_order_items
ADD CONSTRAINT procurement_order_items_po_product_key UNIQUE (procurement_order_id, product_id);
