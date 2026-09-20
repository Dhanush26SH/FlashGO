-- Option A: Unified Physical staff_payout_details table

-- 1. If we previously created a view, drop it so we can safely rename the table
-- 1. Skipped dropping view because it never existed

-- 2. Rename the existing physical table (if it hasn't been renamed yet)
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'driver_payout_details') THEN
        ALTER TABLE public.driver_payout_details RENAME TO staff_payout_details;
        ALTER TABLE public.staff_payout_details RENAME COLUMN driver_id TO staff_id;
    END IF;
END $$;

-- 3. Update Row Level Security Policies
-- Drop old policies
DROP POLICY IF EXISTS "Drivers can view own payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Drivers can insert/update own payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Admins can view all payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Warehouse staff can view all payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Staff can view own payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Staff can insert/update own payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Admins can view all staff payout details" ON public.staff_payout_details;
DROP POLICY IF EXISTS "Warehouse staff can view staff payout details" ON public.staff_payout_details;

-- Create unified staff policies
CREATE POLICY "Staff can view own payout details"
    ON public.staff_payout_details FOR SELECT
    USING (auth.uid() = staff_id);

CREATE POLICY "Staff can insert/update own payout details"
    ON public.staff_payout_details FOR ALL
    USING (auth.uid() = staff_id);

CREATE POLICY "Admins can view all staff payout details"
    ON public.staff_payout_details FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Warehouse staff can view staff payout details"
    ON public.staff_payout_details FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            JOIN public.driver_onboarding onboarding ON onboarding.id = staff_payout_details.staff_id
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'warehouse_staff'
            AND profiles.warehouse_id = onboarding.warehouse_id
        )
    );

-- 4. Update existing Driver RPCs to point to the new physical table staff_payout_details

CREATE OR REPLACE FUNCTION public.submit_driver_application()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_onboarding RECORD;
    v_profile RECORD;
    v_warehouse RECORD;
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
    IF v_profile.role = 'driver' THEN RETURN jsonb_build_object('success', true, 'message', 'Already a driver'); END IF;
    IF v_profile.requested_role != 'driver' THEN RAISE EXCEPTION 'Driver role not requested'; END IF;

    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Driver onboarding application not found'; END IF;
    IF v_onboarding.status IN ('submitted', 'under_review', 'approved') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already submitted or approved');
    END IF;

    IF v_onboarding.language_pref IS NULL THEN RAISE EXCEPTION 'Language preference missing'; END IF;
    IF v_onboarding.vehicle_type IS NULL THEN RAISE EXCEPTION 'Vehicle type missing'; END IF;
    IF v_onboarding.work_area IS NULL THEN RAISE EXCEPTION 'Work area missing'; END IF;
    IF v_onboarding.work_type IS NULL THEN RAISE EXCEPTION 'Work type missing'; END IF;
    IF v_onboarding.warehouse_id IS NULL THEN RAISE EXCEPTION 'Warehouse missing'; END IF;
    IF v_onboarding.selfie_url IS NULL THEN RAISE EXCEPTION 'Selfie missing'; END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_onboarding.warehouse_id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or inactive warehouse'; END IF;
    IF v_warehouse.work_area != v_onboarding.work_area THEN RAISE EXCEPTION 'Warehouse work area does not match selected work area'; END IF;

    -- *** UPDATED TO USE staff_payout_details ***
    IF NOT EXISTS (SELECT 1 FROM public.staff_payout_details WHERE staff_id = v_uid) THEN
        RAISE EXCEPTION 'Payout details missing';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.driver_nominee_details WHERE driver_id = v_uid) THEN RAISE EXCEPTION 'Nominee details missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.driver_agreement_acceptances WHERE driver_id = v_uid) THEN RAISE EXCEPTION 'Terms agreement missing'; END IF;

    UPDATE public.driver_onboarding SET status = 'submitted', submission_time = now() WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'message', 'Application submitted successfully');
END;
$$;

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
    SELECT * INTO v_admin FROM public.profiles WHERE id = auth.uid() AND role = 'admin';
    IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF p_driver_id = auth.uid() THEN RAISE EXCEPTION 'Cannot approve self'; END IF;

    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = p_driver_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Driver onboarding application not found'; END IF;
    IF v_admin.warehouse_id IS NOT NULL THEN
        IF v_admin.warehouse_id != v_onboarding.warehouse_id THEN RAISE EXCEPTION 'Unauthorized: Warehouse scope mismatch'; END IF;
    END IF;

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
        IF v_onboarding.vehicle_type IS NULL OR v_onboarding.work_area IS NULL OR v_onboarding.warehouse_id IS NULL OR v_onboarding.selfie_url IS NULL THEN RAISE EXCEPTION 'Incomplete onboarding profile data'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = v_onboarding.warehouse_id AND is_active = true) THEN RAISE EXCEPTION 'Invalid or inactive warehouse'; END IF;

        -- *** UPDATED TO USE staff_payout_details ***
        IF NOT EXISTS (SELECT 1 FROM public.staff_payout_details WHERE staff_id = p_driver_id) THEN
            RAISE EXCEPTION 'Payout details missing';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_nominee_details WHERE driver_id = p_driver_id) THEN RAISE EXCEPTION 'Nominee details missing'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.driver_agreement_acceptances WHERE driver_id = p_driver_id) THEN RAISE EXCEPTION 'Terms agreement missing'; END IF;

        v_existing_emp_id := v_profile.employee_id;
        IF v_existing_emp_id IS NULL THEN v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq'); END IF;

        UPDATE public.profiles SET role = 'driver', warehouse_id = v_onboarding.warehouse_id, employee_id = v_existing_emp_id, is_pending_staff = FALSE, requested_role = NULL WHERE id = p_driver_id;
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
