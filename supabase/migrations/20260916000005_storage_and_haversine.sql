-- Migration: 20260916000005_storage_and_haversine.sql
-- Description: Create driver_check_ins bucket, storage RLS policies, and Haversine function

-- 1. Create the private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver_check_ins', 'driver_check_ins', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies
-- Allow Drivers to INSERT (upload) ONLY to their own uid prefix
-- The path must be: auth.uid() / staff_shift_id / random_uuid.jpg
-- Note: Supabase storage objects name is the path inside the bucket.
CREATE POLICY "Drivers can upload check-in selfies"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'driver_check_ins' AND
    (auth.uid()::text = (string_to_array(name, '/'))[1]) AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'driver'
);

-- Deny UPDATE and DELETE explicitly for all non-superusers on this bucket.
-- Evidence is immutable.
-- Since there are no UPDATE/DELETE policies granted, it's denied by default,
-- but we can explicitly just NOT grant any.

-- Allow Admins to SELECT (read) objects from the bucket
CREATE POLICY "Admins can view driver check-in selfies"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'driver_check_ins' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Note: Drivers cannot SELECT even their own images.


-- 3. Haversine Function
CREATE OR REPLACE FUNCTION public.calculate_haversine_distance(
    lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT
) RETURNS FLOAT AS $$
DECLARE
    radius FLOAT := 6371000; -- Earth radius in meters
    dLat FLOAT;
    dLon FLOAT;
    a FLOAT;
    c FLOAT;
BEGIN
    dLat := radians(lat2 - lat1);
    dLon := radians(lon2 - lon1);
    lat1 := radians(lat1);
    lat2 := radians(lat2);

    a := sin(dLat/2) * sin(dLat/2) +
         sin(dLon/2) * sin(dLon/2) * cos(lat1) * cos(lat2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN radius * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
