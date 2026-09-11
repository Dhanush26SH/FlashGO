-- Phase 19.2: Secure Workforce Operations
-- 1. Employee ID Sequence & Unique Constraint
CREATE SEQUENCE IF NOT EXISTS public.staff_emp_seq START 10000;

ALTER TABLE public.profiles ADD CONSTRAINT unique_employee_id UNIQUE (employee_id);

-- 2. Atomic Staff Approval RPC
CREATE OR REPLACE FUNCTION public.approve_staff_role(
    p_user_id UUID, 
    p_role public.user_role, 
    p_clean_name TEXT,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_emp_id TEXT;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Fetch existing employee ID to preserve idempotency
    SELECT employee_id INTO v_existing_emp_id FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    IF v_existing_emp_id IS NULL THEN
        -- Generate unique ID using sequence
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
END;
$$;

-- 3. Secure Warehouse Reassignment
CREATE OR REPLACE FUNCTION public.admin_update_staff_warehouse(
    p_target_id UUID,
    p_warehouse_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Validate active work for Pickers (Assigned/Picking orders scope to a warehouse)
    IF v_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('assigned', 'picking')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Picker has active assigned orders';
        END IF;
    END IF;

    -- Note: Drivers don't have a direct warehouse_id in profiles in standard architecture, but if they do, 
    -- they shouldn't be reassigned while on a trip.
    IF v_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Driver has active trips';
        END IF;
    END IF;

    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;
    RETURN TRUE;
END;
$$;

-- 4. Secure Role Reassignment
CREATE OR REPLACE FUNCTION public.admin_update_staff_role(
    p_target_id UUID,
    p_role public.user_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Cannot assign non-operational role via this workflow';
    END IF;

    SELECT role INTO v_old_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_old_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Check for active work that prevents role change
    IF v_old_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot change role: Driver has active trips';
        END IF;
    END IF;

    IF v_old_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('assigned', 'picking')) THEN
            RAISE EXCEPTION 'Cannot change role: Picker has active assigned orders';
        END IF;
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;
    RETURN TRUE;
END;
$$;

-- 5. Secure Shift Management
CREATE OR REPLACE FUNCTION public.admin_create_staff_shift(
    p_staff_id UUID,
    p_warehouse_id UUID,
    p_shift_start TIMESTAMPTZ,
    p_shift_end TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_shift_end <= p_shift_start THEN
        RAISE EXCEPTION 'Shift end must be after shift start';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_staff_id;
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status)
    VALUES (p_staff_id, p_warehouse_id, p_shift_start, p_shift_end, 'scheduled');

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_shift_status(
    p_shift_id UUID,
    p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_status NOT IN ('scheduled', 'present', 'absent', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid shift status';
    END IF;

    UPDATE public.staff_shifts SET status = p_status WHERE id = p_shift_id;
    RETURN TRUE;
END;
$$;

-- 6. Lock down direct staff_shifts table mutation
DROP POLICY IF EXISTS "Admins full access to shifts" ON public.staff_shifts;
CREATE POLICY "Admins full access to shifts" ON public.staff_shifts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Note on Profile Self-Updates:
-- RLS Policy "User update self profile" exists on public.profiles FOR UPDATE USING (auth.uid() = id).
-- To prevent self-escalation via direct update (e.g., setting role='admin', is_suspended=false),
-- we create a trigger to block sensitive updates if not admin.
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Always allow the system or admins
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    
    IF auth.uid() = NEW.id AND (v_caller_role IS NULL OR v_caller_role != 'admin') THEN
        -- Prevent role escalation or suspension bypass
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            RAISE EXCEPTION 'Cannot modify role directly';
        END IF;
        IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
            RAISE EXCEPTION 'Cannot modify suspension status directly';
        END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
            RAISE EXCEPTION 'Cannot modify employee ID directly';
        END IF;
        IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
            RAISE EXCEPTION 'Cannot modify warehouse directly';
        END IF;
        IF NEW.is_pending_staff IS DISTINCT FROM OLD.is_pending_staff THEN
            RAISE EXCEPTION 'Cannot modify pending staff status directly';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sensitive_profile_fields_trigger ON public.profiles;
CREATE TRIGGER protect_sensitive_profile_fields_trigger
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_sensitive_profile_fields();
