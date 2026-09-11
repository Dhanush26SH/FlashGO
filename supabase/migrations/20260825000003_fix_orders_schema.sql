-- Fix missing columns in orders table

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_speed TEXT DEFAULT 'standard';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_cold_chain BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN DEFAULT false;
