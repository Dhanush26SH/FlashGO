-- Fix inventory_reservations check constraint to allow 0 quantity when consumed

ALTER TABLE public.inventory_reservations DROP CONSTRAINT IF EXISTS inventory_reservations_quantity_check;
ALTER TABLE public.inventory_reservations ADD CONSTRAINT inventory_reservations_quantity_check CHECK (quantity >= 0);
