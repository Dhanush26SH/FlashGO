-- Allow pending staff (specifically those onboarding as drivers) to read active warehouses
-- so they can select their work area and warehouse.

CREATE POLICY "Pending staff can read active warehouses"
    ON public.warehouses
    FOR SELECT
    USING (
        is_active = true
        AND auth.uid() IN (
            SELECT id FROM public.profiles
            WHERE is_pending_staff = true
        )
    );
