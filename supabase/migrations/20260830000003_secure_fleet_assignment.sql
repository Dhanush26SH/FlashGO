-- Migration: 20260830000003_secure_fleet_assignment.sql
-- Description: Secure assign_vehicle RPC and protect current_vehicle_id

-- 1. Secure the vehicle assignment RPC
CREATE OR REPLACE FUNCTION public.assign_vehicle(p_driver_id UUID, p_vehicle_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_driver RECORD;
    v_vehicle RECORD;
BEGIN
    -- 1. Enforce Admin Caller
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Only Admins can assign vehicles';
    END IF;

    -- 2. Lock driver profile for concurrency
    SELECT * INTO v_driver FROM public.profiles WHERE id = p_driver_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target driver not found';
    END IF;
    
    -- 3. Validate Driver Role & Suspension
    IF v_driver.role != 'driver' THEN
        RAISE EXCEPTION 'Target profile is not a driver';
    END IF;
    IF v_driver.is_suspended = true THEN
        RAISE EXCEPTION 'Target driver is suspended';
    END IF;
    IF v_driver.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Target driver has no warehouse assigned';
    END IF;

    -- 4. Online + Active Work Guards
    -- A. Driver is online (must use driver_sessions as authoritative or is_online if that's what check_driver_online_guard uses)
    -- FlashGO frozen architecture uses is_online as the authoritative toggle, checked by check_driver_online_guard.
    IF v_driver.is_online = true THEN
        RAISE EXCEPTION 'Cannot change vehicle assignment while driver is online';
    END IF;

    -- B. Driver has active work
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips 
        WHERE driver_id = p_driver_id 
        AND status IN ('assigned', 'accepted', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'Cannot change vehicle assignment while driver has an active trip';
    END IF;

    -- 5. Mark as internal mutation for trigger
    PERFORM set_config('flashgo.internal_vehicle_assignment', 'true', true);

    -- 6. Unassignment Flow
    IF p_vehicle_id IS NULL THEN
        UPDATE public.profiles SET current_vehicle_id = NULL WHERE id = p_driver_id;
        RETURN;
    END IF;

    -- 7. Assignment Flow
    -- Lock vehicle
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;
    
    IF v_vehicle.status != 'active' THEN
        RAISE EXCEPTION 'Vehicle is not active';
    END IF;

    IF v_driver.warehouse_id != v_vehicle.warehouse_id THEN
        RAISE EXCEPTION 'Driver and vehicle warehouse must match';
    END IF;

    -- Check if vehicle is already assigned (Concurrency safe due to FOR UPDATE on driver, but another driver might have it)
    -- Wait, the UNIQUE INDEX unique_active_vehicle_assignment on profiles(current_vehicle_id) enforces one vehicle per driver.
    -- But we also manually check and give a nice error message:
    IF EXISTS (SELECT 1 FROM public.profiles WHERE current_vehicle_id = p_vehicle_id AND id != p_driver_id) THEN
        RAISE EXCEPTION 'Vehicle is already assigned to another driver';
    END IF;

    UPDATE public.profiles SET current_vehicle_id = p_vehicle_id WHERE id = p_driver_id;
END;
$$;

-- Revoke public execute to be safe, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.assign_vehicle(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_vehicle(UUID, UUID) TO authenticated;


-- 2. Protect current_vehicle_id from raw DML bypass
CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    
    IF auth.uid() = NEW.id AND (v_caller_role IS NULL OR v_caller_role != 'admin') THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Cannot modify role directly'; END IF;
        IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN RAISE EXCEPTION 'Cannot modify suspension status directly'; END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'Cannot modify employee ID directly'; END IF;
        IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN RAISE EXCEPTION 'Cannot modify warehouse directly'; END IF;
        IF NEW.is_pending_staff IS DISTINCT FROM OLD.is_pending_staff THEN RAISE EXCEPTION 'Cannot modify pending staff status directly'; END IF;
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


-- 3. Vehicle Retirement Protection Trigger
CREATE OR REPLACE FUNCTION protect_vehicle_retirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status != 'active' AND OLD.status = 'active' THEN
        -- Check if currently assigned to any driver
        IF EXISTS (SELECT 1 FROM public.profiles WHERE current_vehicle_id = NEW.id) THEN
            RAISE EXCEPTION 'Cannot retire or deactivate a vehicle while it is assigned to a driver. Unassign it first.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vehicle_retirement ON public.vehicles;
CREATE TRIGGER enforce_vehicle_retirement
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION protect_vehicle_retirement();

-- 4. Vehicle Creation Validation Trigger
CREATE OR REPLACE FUNCTION validate_vehicle_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Ensure uppercase and trim
    NEW.license_plate := UPPER(TRIM(NEW.license_plate));

    IF NEW.license_plate = '' THEN
        RAISE EXCEPTION 'License plate cannot be empty';
    END IF;
    IF NEW.vehicle_type IS NULL OR NEW.vehicle_type = '' THEN
        RAISE EXCEPTION 'Vehicle type cannot be empty';
    END IF;
    IF NEW.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Warehouse ID cannot be empty';
    END IF;
    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status := 'active';
    END IF;

    -- License plate uniqueness is already enforced by the UNIQUE constraint on the table
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_vehicle_creation ON public.vehicles;
CREATE TRIGGER enforce_vehicle_creation
    BEFORE INSERT OR UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION validate_vehicle_creation();
