-- Phase 19.1: Staff Onboarding & Pending Approval

-- 1. Add onboarding fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pending_staff BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_role public.user_role NULL;

-- 2. Request Staff Access RPC (used by new mobile-staff users)
CREATE OR REPLACE FUNCTION public.request_staff_access(
    p_full_name TEXT,
    p_requested_role public.user_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow requesting valid staff roles
    IF p_requested_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid requested role. Must be picker, driver, or warehouse_staff.';
    END IF;

    -- Update the calling user's profile
    UPDATE public.profiles
    SET 
        full_name = p_full_name,
        requested_role = p_requested_role,
        is_pending_staff = TRUE
    WHERE id = auth.uid() 
      AND role = 'customer'; -- Ensure they haven't already been granted a staff role

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found or you are already a staff member.';
    END IF;
END;
$$;

-- 3. Reject Staff Access RPC (used by Admin)
CREATE OR REPLACE FUNCTION public.reject_staff_access(
    p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Clear the pending status
    UPDATE public.profiles
    SET 
        is_pending_staff = FALSE,
        requested_role = NULL
    WHERE id = p_user_id;
END;
$$;

-- 4. Update existing approve_staff_role RPC to clear pending fields and assign warehouse
CREATE OR REPLACE FUNCTION public.approve_staff_role(
    p_user_id UUID, 
    p_role public.user_role, 
    p_employee_id TEXT, 
    p_clean_name TEXT,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.profiles 
    SET role = p_role, 
        full_name = p_clean_name,
        employee_id = p_employee_id,
        is_pending_staff = FALSE,
        requested_role = NULL,
        warehouse_id = p_warehouse_id
    WHERE id = p_user_id;
END;
$$;
