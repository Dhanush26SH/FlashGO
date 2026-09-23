-- 20260922000017_warehouse_staff_verification.sql

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
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot approve self';
    END IF;

    -- Block Driver approval through generic path
    IF p_role = 'driver' THEN
        RAISE EXCEPTION 'Driver approval must use dedicated driver verification flow. Use approve_driver_application instead.';
    END IF;

    IF p_role NOT IN ('picker', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid role for generic staff approval';
    END IF;

    IF p_warehouse_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive warehouse selected';
        END IF;
    END IF;

    SELECT role, employee_id, phone INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    -- NEW: Enforce phone number requirement for Picker and Warehouse Staff
    IF v_target.phone IS NULL OR trim(v_target.phone) = '' THEN
        RAISE EXCEPTION 'User profile must have a valid phone number before approval';
    END IF;

    -- NEW: Enforce bank details requirement for Picker and Warehouse Staff
    IF NOT EXISTS (
        SELECT 1 FROM public.staff_payout_details 
        WHERE staff_id = p_user_id 
          AND account_number IS NOT NULL 
          AND ifsc IS NOT NULL 
          AND bank_name IS NOT NULL
          AND account_holder IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'User must complete Bank Details before approval';
    END IF;

    v_existing_emp_id := v_target.employee_id;

    IF v_existing_emp_id IS NULL THEN
        v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq');
    END IF;

    UPDATE public.profiles 
    SET role = p_role, 
        full_name = p_clean_name,
        employee_id = v_existing_emp_id,
        is_pending_staff = FALSE,
        requested_role = NULL,
        warehouse_id = p_warehouse_id
    WHERE id = p_user_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_APPROVED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('role', v_target.role),
        jsonb_build_object('role', p_role, 'warehouse_id', p_warehouse_id, 'employee_id', v_existing_emp_id), NULL
    );
END;
$$;
