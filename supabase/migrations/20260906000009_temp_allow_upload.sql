
CREATE POLICY "Anon Temp Insert" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Anon Temp Update" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'product-images');
  