-- Add new fields for Phase 2 Address Flow
ALTER TABLE public.customer_addresses
ADD COLUMN IF NOT EXISTS flat_house_no TEXT,
ADD COLUMN IF NOT EXISTS floor TEXT,
ADD COLUMN IF NOT EXISTS landmark TEXT;
