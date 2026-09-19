-- Add SELECT RLS policy on public.dev_test_accounts
-- Permitting only authenticated Admins (using the standard FlashGO RBAC pattern)

CREATE POLICY "Admins can view dev_test_accounts"
ON public.dev_test_accounts
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'::user_role
  )
);
