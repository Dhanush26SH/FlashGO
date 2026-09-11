-- Create customer_addresses table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- e.g., 'Home', 'Work', 'Other'
    address_line TEXT NOT NULL,
    lat DECIMAL,
    lng DECIMAL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by customer
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);

-- Ensure only one default address per customer
CREATE UNIQUE INDEX IF NOT EXISTS unique_default_address_per_customer 
ON customer_addresses(customer_id) 
WHERE is_default = true;

-- Enable Row Level Security
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Customers can view their own addresses"
    ON customer_addresses FOR SELECT
    USING (auth.uid() = customer_id);

CREATE POLICY "Customers can insert their own addresses"
    ON customer_addresses FOR INSERT
    WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update their own addresses"
    ON customer_addresses FOR UPDATE
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can delete their own addresses"
    ON customer_addresses FOR DELETE
    USING (auth.uid() = customer_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
