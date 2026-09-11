-- Add structured address details and receiver contact info to customer_addresses
ALTER TABLE public.customer_addresses
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS locality TEXT,
ADD COLUMN IF NOT EXISTS street_address TEXT,
ADD COLUMN IF NOT EXISTS receiver_name TEXT,
ADD COLUMN IF NOT EXISTS receiver_phone TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- We intentionally leave these columns nullable to preserve existing rows.
-- address_line remains untouched and acts as a safe fallback.
