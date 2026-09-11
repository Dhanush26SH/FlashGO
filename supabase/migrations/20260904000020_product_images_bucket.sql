-- 20260904000020_product_images_bucket.sql
-- Create secure bucket for product images

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Security Policies

-- Public Read
CREATE POLICY "Public Read Product Images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Admin Manage
CREATE POLICY "Admin Insert Product Images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images' AND
    (auth.jwt() ->> 'role') = 'admin'
);

CREATE POLICY "Admin Update Product Images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'product-images' AND
    (auth.jwt() ->> 'role') = 'admin'
);

CREATE POLICY "Admin Delete Product Images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'product-images' AND
    (auth.jwt() ->> 'role') = 'admin'
);
