-- 20260910163000_fix_staff_approval.sql

-- 1. Drop all existing overloaded versions of approve_staff_role to fix signature mismatch
DROP FUNCTION IF EXISTS public.approve_staff_role(uuid, public.user_role, text, text);
DROP FUNCTION IF EXISTS public.approve_staff_role(uuid, public.user_role, text, uuid);
DROP FUNCTION IF EXISTS public.approve_staff_role(uuid, public.user_role, text, text, uuid);

-- 2. Create the exact requested definition
CREATE OR REPLACE FUNCTION public.approve_staff_role(
    p_user_id UUID, 
    p_role public.user_role, 
    p_clean_name TEXT,
    p_warehouse_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_emp_id TEXT;
    v_target RECORD;
BEGIN
    -- Verify caller is admin (authorization check)
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Prevent self-approval even if somehow admin
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot approve self';
    END IF;

    -- Validate requested role is allowed
    IF p_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid role for staff approval';
    END IF;

    -- Validate selected warehouse exists and is active
    IF p_warehouse_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive warehouse selected';
        END IF;
    END IF;

    -- Lock row and fetch existing profile data
    SELECT role, employee_id INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    v_existing_emp_id := v_target.employee_id;

    -- Generate employee_id if it doesn't exist
    IF v_existing_emp_id IS NULL THEN
        v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq');
    END IF;

    -- Update profile fields securely on the backend
    UPDATE public.profiles 
    SET role = p_role, 
        full_name = p_clean_name,
        employee_id = v_existing_emp_id,
        is_pending_staff = FALSE,
        requested_role = NULL,
        warehouse_id = p_warehouse_id
    WHERE id = p_user_id;

    -- Audit log
    PERFORM public.write_admin_audit_log(
        'STAFF_APPROVED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('role', v_target.role),
        jsonb_build_object('role', p_role, 'warehouse_id', p_warehouse_id, 'employee_id', v_existing_emp_id), NULL
    );
END;
$$;
