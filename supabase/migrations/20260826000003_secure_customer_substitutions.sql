-- 20260826000003_secure_customer_substitutions.sql
-- Drop the overly permissive Customer ALL policy
DROP POLICY IF EXISTS "Customer read update self substitutions" ON public.order_substitutions;

-- Create a read-only policy for Customers
CREATE POLICY "Customer read self substitutions" 
ON public.order_substitutions 
FOR SELECT 
USING (
    auth.uid() IN (SELECT customer_id FROM public.orders WHERE id = order_id)
);

-- Secure RPC for Customer to respond to a substitution
CREATE OR REPLACE FUNCTION public.respond_to_substitution(
    p_sub_id UUID,
    p_status TEXT
) RETURNS VOID AS $$
DECLARE
    v_sub RECORD;
    v_customer_id UUID;
BEGIN
    -- 1. Validate status transition
    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status. Must be approved or rejected.';
    END IF;

    -- 2. Fetch the substitution and its order's customer_id
    SELECT os.*, o.customer_id 
    INTO v_sub
    FROM public.order_substitutions os
    JOIN public.orders o ON o.id = os.order_id
    WHERE os.id = p_sub_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Substitution not found.';
    END IF;

    -- 3. Security Check: Must be the owning customer
    IF auth.uid() != v_sub.customer_id THEN
        RAISE EXCEPTION 'Unauthorized to respond to this substitution.';
    END IF;

    -- 4. State Check: Must be pending
    IF v_sub.status != 'pending' THEN
        RAISE EXCEPTION 'Substitution is already resolved (%).', v_sub.status;
    END IF;

    -- 5. Perform the update
    UPDATE public.order_substitutions
    SET 
        status = p_status,
        actioned_at = timezone('utc'::text, now())
    WHERE id = p_sub_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
