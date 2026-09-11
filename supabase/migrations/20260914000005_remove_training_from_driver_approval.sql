CREATE OR REPLACE FUNCTION public.approve_driver_application(p_driver_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_onboarding RECORD;
    v_profile RECORD;
    v_admin RECORD;
    v_existing_emp_id TEXT;
BEGIN
    -- Verify admin caller
    SELECT * INTO v_admin FROM public.profiles WHERE id = auth.uid() AND role = 'admin';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_driver_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot approve self';
    END IF;

    -- Lock and fetch onboarding record
    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = p_driver_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver onboarding application not found';
    END IF;

    -- Enforce Warehouse Manager Scope
    IF v_admin.warehouse_id IS NOT NULL THEN
        IF v_admin.warehouse_id != v_onboarding.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Warehouse scope mismatch';
        END IF;
    END IF;

    -- Lock and fetch profile
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_driver_id FOR UPDATE;

    IF p_action = 'reject' THEN
        UPDATE public.driver_onboarding SET status = 'rejected', rejection_reason = p_reason WHERE id = p_driver_id;
        RETURN;
    END IF;

    IF p_action = 'request_changes' THEN
        UPDATE public.driver_onboarding SET status = 'changes_requested', rejection_reason = p_reason WHERE id = p_driver_id;
        RETURN;
    END IF;

    IF p_action = 'approve' THEN
        -- Verify mandatory fields
        IF v_onboarding.vehicle_type IS NULL OR v_onboarding.work_area IS NULL OR v_onboarding.warehouse_id IS NULL OR v_onboarding.selfie_url IS NULL THEN
            RAISE EXCEPTION 'Incomplete onboarding profile data';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = v_onboarding.warehouse_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive warehouse';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_payout_details WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Payout details missing';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_nominee_details WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Nominee details missing';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_agreement_acceptances WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Terms agreement missing';
        END IF;

        -- Approval logic
        v_existing_emp_id := v_profile.employee_id;
        IF v_existing_emp_id IS NULL THEN
            v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq');
        END IF;

        -- Update Profile
        UPDATE public.profiles 
        SET role = 'driver', 
            warehouse_id = v_onboarding.warehouse_id,
            employee_id = v_existing_emp_id,
            is_pending_staff = FALSE,
            requested_role = NULL
        WHERE id = p_driver_id;

        -- Update Onboarding Application
        UPDATE public.driver_onboarding SET status = 'approved', rejection_reason = NULL WHERE id = p_driver_id;

        PERFORM public.write_admin_audit_log(
            'DRIVER_VERIFIED_AND_APPROVED', 'profiles', p_driver_id::text, NULL,
            jsonb_build_object('role', v_profile.role, 'status', v_onboarding.status),
            jsonb_build_object('role', 'driver', 'warehouse_id', v_onboarding.warehouse_id, 'employee_id', v_existing_emp_id, 'status', 'approved'), NULL
        );
    ELSE
        RAISE EXCEPTION 'Invalid action';
    END IF;

END;
$function$;
