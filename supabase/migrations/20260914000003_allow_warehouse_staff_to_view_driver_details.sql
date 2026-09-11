-- Migration: Allow warehouse staff to view driver details
-- Needed so warehouse-scoped admins (role = 'warehouse_staff') can see nominee, payout, agreements, and selfie images

-- 1. Payout Details
CREATE POLICY "Warehouse staff can view all payout details"
    ON public.driver_payout_details FOR SELECT
    USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'warehouse_staff'::user_role ));

-- 2. Nominee Details
CREATE POLICY "Warehouse staff can view all nominee details"
    ON public.driver_nominee_details FOR SELECT
    USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'warehouse_staff'::user_role ));

-- 3. Agreement Acceptances
CREATE POLICY "Warehouse staff can view all agreements"
    ON public.driver_agreement_acceptances FOR SELECT
    USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'warehouse_staff'::user_role ));

-- 4. Storage Objects for driver_documents
CREATE POLICY "Warehouse staff can view all documents"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'driver_documents'::text AND EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'warehouse_staff'::public.user_role ));
