-- Migration: Fix driver review admin scope
-- Corrects over-granted permissions and enforces strict warehouse scoping for Admins

-- 1. Drop incorrect warehouse_staff policies from previous migration
DROP POLICY IF EXISTS "Warehouse staff can view all payout details" ON public.driver_payout_details;
DROP POLICY IF EXISTS "Warehouse staff can view all nominee details" ON public.driver_nominee_details;
DROP POLICY IF EXISTS "Warehouse staff can view all agreements" ON public.driver_agreement_acceptances;
DROP POLICY IF EXISTS "Warehouse staff can view all documents" ON storage.objects;

-- 2. Drop existing broadly scoped admin policies
DROP POLICY IF EXISTS "Admins can view all onboardings" ON public.driver_onboarding;
DROP POLICY IF EXISTS "Admins can view all payout details" ON public.driver_payout_details;
DROP POLICY IF EXISTS "Admins can view all nominee details" ON public.driver_nominee_details;
DROP POLICY IF EXISTS "Admins can view all agreements" ON public.driver_agreement_acceptances;
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;

-- 3. Create strictly scoped Admin policies for driver_onboarding
CREATE POLICY "Admins can view scoped onboardings"
    ON public.driver_onboarding FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'admin'
              AND (admin_profile.warehouse_id IS NULL OR admin_profile.warehouse_id = driver_onboarding.warehouse_id)
        )
    );

-- 4. Create strictly scoped Admin policies for driver relations
CREATE POLICY "Admins can view scoped payout details"
    ON public.driver_payout_details FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            JOIN public.driver_onboarding onboarding ON onboarding.id = driver_payout_details.driver_id
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'admin'
              AND (admin_profile.warehouse_id IS NULL OR admin_profile.warehouse_id = onboarding.warehouse_id)
        )
    );

CREATE POLICY "Admins can view scoped nominee details"
    ON public.driver_nominee_details FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            JOIN public.driver_onboarding onboarding ON onboarding.id = driver_nominee_details.driver_id
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'admin'
              AND (admin_profile.warehouse_id IS NULL OR admin_profile.warehouse_id = onboarding.warehouse_id)
        )
    );

CREATE POLICY "Admins can view scoped agreements"
    ON public.driver_agreement_acceptances FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            JOIN public.driver_onboarding onboarding ON onboarding.id = driver_agreement_acceptances.driver_id
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'admin'
              AND (admin_profile.warehouse_id IS NULL OR admin_profile.warehouse_id = onboarding.warehouse_id)
        )
    );

-- 5. Create strictly scoped Admin policy for driver_documents storage
CREATE POLICY "Admins can view scoped documents"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'driver_documents' AND EXISTS (
            SELECT 1 FROM public.profiles admin_profile
            JOIN public.driver_onboarding onboarding ON onboarding.id::text = (storage.foldername(storage.objects.name))[1]
            WHERE admin_profile.id = auth.uid()
              AND admin_profile.role = 'admin'
              AND (admin_profile.warehouse_id IS NULL OR admin_profile.warehouse_id = onboarding.warehouse_id)
        )
    );
