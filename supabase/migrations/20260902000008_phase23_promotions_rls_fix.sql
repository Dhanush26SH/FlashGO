-- Drop the insecure FOR ALL policy
DROP POLICY IF EXISTS "Admins full access to promotions" ON public.promotions;

-- Add a safe FOR SELECT policy for Admins
CREATE POLICY "Admins full read access to promotions" ON public.promotions
    FOR SELECT
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Note: No INSERT, UPDATE, or DELETE policies exist.
-- Therefore, ALL direct DML is blocked for ALL roles (including Admins).
-- Admins MUST use the SECURITY DEFINER RPCs (admin_create_promotion, etc.)
-- which bypass RLS to perform the mutations and write audit logs.
