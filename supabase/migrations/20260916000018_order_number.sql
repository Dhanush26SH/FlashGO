-- Migration: 20260916000018_order_number.sql
-- Description: Adds a human-readable order_number to orders table

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_number TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        -- Generate a readable order number like FG-20260911-3A4B
        NEW.order_number := 'FG-' || to_char(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 5));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.generate_order_number();

-- Backfill existing orders safely
UPDATE public.orders
SET order_number = 'FG-' || to_char(created_at, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(id::text FROM 1 FOR 5))
WHERE order_number IS NULL;
