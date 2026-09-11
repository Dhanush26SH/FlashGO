-- 20260831000010_fix_protect_trigger.sql

CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() = NEW.id THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Cannot modify role directly'; END IF;
        IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN RAISE EXCEPTION 'Cannot modify suspension status directly'; END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'Cannot modify employee ID directly'; END IF;
        IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN RAISE EXCEPTION 'Cannot modify warehouse directly'; END IF;
        
        IF NEW.is_pending_staff IS DISTINCT FROM OLD.is_pending_staff OR NEW.requested_role IS DISTINCT FROM OLD.requested_role THEN 
            IF current_setting('flashgo.internal_mutation', true) IS DISTINCT FROM 'true' THEN
                RAISE EXCEPTION 'Cannot modify pending staff status directly'; 
            END IF;
        END IF;
    END IF;

    -- Strict Wallet Protection
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR NEW.cod_wallet_liability IS DISTINCT FROM OLD.cod_wallet_liability THEN
        IF current_setting('flashgo.internal_mutation', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Cannot modify financial balances directly. Use authoritative RPCs.';
        END IF;
    END IF;

    -- Strict Vehicle Assignment Protection
    IF NEW.current_vehicle_id IS DISTINCT FROM OLD.current_vehicle_id THEN
        IF current_setting('flashgo.internal_vehicle_assignment', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Cannot modify vehicle assignment directly. Use assign_vehicle RPC.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Update request_staff_access to use GUC
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

    PERFORM set_config('flashgo.internal_mutation', 'true', true);

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
