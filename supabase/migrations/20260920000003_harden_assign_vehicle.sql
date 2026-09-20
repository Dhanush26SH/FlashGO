-- Migration: 20260920000003_harden_assign_vehicle.sql
-- Description: Harden assign_vehicle to strictly protect personal vehicle ownership

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
    IF v_driver.is_online = true THEN
        RAISE EXCEPTION 'Cannot change vehicle assignment while driver is online';
    END IF;

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

    -- NEW: Personal Vehicle Ownership Guard
    IF v_vehicle.ownership_type = 'driver_owned' THEN
        IF v_vehicle.owner_driver_id != p_driver_id THEN
            RAISE EXCEPTION 'Personal vehicle can only be assigned to its owner';
        END IF;
    ELSIF v_vehicle.ownership_type = 'company_owned' THEN
        IF v_driver.warehouse_id != v_vehicle.warehouse_id THEN
            RAISE EXCEPTION 'Driver and vehicle warehouse must match';
        END IF;
    END IF;

    -- Check if vehicle is already assigned
    IF EXISTS (SELECT 1 FROM public.profiles WHERE current_vehicle_id = p_vehicle_id AND id != p_driver_id) THEN
        RAISE EXCEPTION 'Vehicle is already assigned to another driver';
    END IF;

    UPDATE public.profiles SET current_vehicle_id = p_vehicle_id WHERE id = p_driver_id;
END;
$$;

-- Revoke public execute to be safe, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.assign_vehicle(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_vehicle(UUID, UUID) TO authenticated;
