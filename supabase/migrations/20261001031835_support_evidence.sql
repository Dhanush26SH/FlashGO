-- 20261001031835_support_evidence.sql
-- Additive change to messages for media support
ALTER TABLE public.support_ticket_messages
ADD COLUMN IF NOT EXISTS media_path TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Create private bucket for support evidence
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support_evidence', 
  'support_evidence', 
  false, 
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET 
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Security Policies for storage.objects
-- Note: 'support_evidence' bucket RLS

-- 1. Customer Uploads (INSERT)
CREATE POLICY "Customer inserts own evidence" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'support_evidence' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE id::text = (storage.foldername(name))[2]
    AND customer_id = auth.uid()
  )
);

-- 2. Customer Views (SELECT)
CREATE POLICY "Customer reads own evidence" ON storage.objects FOR SELECT USING (
  bucket_id = 'support_evidence' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  EXISTS (
    SELECT 1 FROM public.support_tickets 
    WHERE id::text = (storage.foldername(name))[2]
    AND customer_id = auth.uid()
  )
);

-- 3. Admin Views (SELECT)
CREATE POLICY "Admin reads all evidence" ON storage.objects FOR SELECT USING (
  bucket_id = 'support_evidence' AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);
