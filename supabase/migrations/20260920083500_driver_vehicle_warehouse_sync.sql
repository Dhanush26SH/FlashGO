-- Migration: 20260920083500_driver_vehicle_warehouse_sync.sql
-- Description: Updates approve_driver_application to synchronize the personal vehicle's warehouse_id with the approved Driver's warehouse_id. Includes a backfill for existing drivers. Relaxes vehicle_ownership_rules to allow this.

-- Relax vehicle_ownership_rules to allow driver_owned vehicles to have a warehouse_id
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicle_ownership_rules;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicle_ownership_rules CHECK (
    (ownership_type = 'driver_owned' AND owner_driver_id IS NOT NULL) OR
    (ownership_type = 'company_owned' AND owner_driver_id IS NULL AND warehouse_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.approve_driver_application(
    p_driver_id uuid, 
    p_action text, 
    p_reason text DEFAULT NULL::text, 
    p_warehouse_id uuid DEFAULT NULL::uuid
)
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

    -- Check Admin scope against the assigned warehouse, not the onboarding one
    IF v_admin.warehouse_id IS NOT NULL AND p_warehouse_id IS NOT NULL THEN
        IF v_admin.warehouse_id != p_warehouse_id THEN RAISE EXCEPTION 'Unauthorized: Warehouse scope mismatch'; END IF;
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
        -- Require authoritative warehouse for approval
        IF p_warehouse_id IS NULL THEN RAISE EXCEPTION 'Authoritative warehouse_id must be provided for approval'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND is_active = true) THEN RAISE EXCEPTION 'Invalid or inactive warehouse'; END IF;

        -- Verify Vehicle Details
        IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE owner_driver_id = p_driver_id AND ownership_type = 'driver_owned') THEN
            RAISE EXCEPTION 'Personal vehicle details missing';
        END IF;

        -- Verify DL details
        IF NOT EXISTS (SELECT 1 FROM public.driver_compliance WHERE driver_id = p_driver_id AND dl_number IS NOT NULL AND trim(dl_number) != '') THEN
            RAISE EXCEPTION 'Driving Licence details missing';
        END IF;

        -- Verify Bank details
        IF NOT EXISTS (SELECT 1 FROM public.staff_payout_details WHERE staff_id = p_driver_id) THEN
            RAISE EXCEPTION 'Payout details missing';
        END IF;

        v_existing_emp_id := v_profile.employee_id;
        IF v_existing_emp_id IS NULL THEN v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq'); END IF;

        -- Assign the provided p_warehouse_id
        UPDATE public.profiles SET role = 'driver', warehouse_id = p_warehouse_id, employee_id = v_existing_emp_id, is_pending_staff = FALSE, requested_role = NULL WHERE id = p_driver_id;
        UPDATE public.driver_onboarding SET status = 'approved', rejection_reason = NULL WHERE id = p_driver_id;

        -- Synchronize the personal vehicle's warehouse_id to match the Driver's warehouse.
        -- Vehicle must remain 'pending' and not be set to current_vehicle_id.
        UPDATE public.vehicles
        SET warehouse_id = p_warehouse_id
        WHERE id = (
            SELECT id FROM public.vehicles 
            WHERE owner_driver_id = p_driver_id 
              AND ownership_type = 'driver_owned' 
              AND status = 'pending'
            ORDER BY updated_at DESC
            LIMIT 1
        );

        PERFORM public.write_admin_audit_log(
            'DRIVER_VERIFIED_AND_APPROVED', 'profiles', p_driver_id::text, NULL,
            jsonb_build_object('role', v_profile.role, 'status', v_onboarding.status),
            jsonb_build_object('role', 'driver', 'warehouse_id', p_warehouse_id, 'employee_id', v_existing_emp_id, 'status', 'approved'), NULL
        );
    ELSE
        RAISE EXCEPTION 'Invalid action';
    END IF;
END;
$function$;

-- One-time reconciliation for already-approved Drivers
UPDATE public.vehicles v
SET warehouse_id = p.warehouse_id
FROM public.profiles p
WHERE v.owner_driver_id = p.id
  AND p.role = 'driver'
  AND p.warehouse_id IS NOT NULL
  AND v.ownership_type = 'driver_owned'
  AND v.status = 'pending'
  AND v.warehouse_id IS NULL;
