-- Migration: 20260920084000_approve_driver_owned_vehicle.sql
-- Description: Adds atomic RPC for approving a driver-owned personal vehicle

CREATE OR REPLACE FUNCTION public.approve_driver_owned_vehicle(p_vehicle_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_vehicle RECORD;
    v_driver RECORD;
BEGIN
    -- 1. Enforce Admin Caller
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'Only Admins can approve driver vehicles';
    END IF;

    -- 2. Lock vehicle
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;

    -- 3. Vehicle Guards
    IF v_vehicle.ownership_type != 'driver_owned' THEN
        RAISE EXCEPTION 'This RPC is only for driver-owned vehicles';
    END IF;
    IF v_vehicle.owner_driver_id IS NULL THEN
        RAISE EXCEPTION 'Vehicle has no owner';
    END IF;
    IF v_vehicle.status != 'pending' THEN
        RAISE EXCEPTION 'Vehicle is not in pending status';
    END IF;
    IF v_vehicle.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Vehicle has no warehouse assigned';
    END IF;

    -- 4. Lock and verify driver profile
    SELECT * INTO v_driver FROM public.profiles WHERE id = v_vehicle.owner_driver_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Owner profile not found';
    END IF;
    IF v_driver.role != 'driver' THEN
        RAISE EXCEPTION 'Owner is not a driver';
    END IF;
    IF v_driver.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Driver has no warehouse assigned';
    END IF;
    IF v_driver.warehouse_id != v_vehicle.warehouse_id THEN
        RAISE EXCEPTION 'Driver and vehicle warehouse must match';
    END IF;

    -- Check if vehicle is already assigned
    IF EXISTS (SELECT 1 FROM public.profiles WHERE current_vehicle_id = p_vehicle_id AND id != v_driver.id) THEN
        RAISE EXCEPTION 'Vehicle is already assigned to another driver';
    END IF;

    -- 5. Mark as internal mutation for trigger
    PERFORM set_config('flashgo.internal_vehicle_assignment', 'true', true);

    -- 6. Atomic operation
    UPDATE public.vehicles SET status = 'active' WHERE id = p_vehicle_id;
    UPDATE public.profiles SET current_vehicle_id = p_vehicle_id WHERE id = v_driver.id;

    -- 7. Audit Log
    PERFORM public.write_admin_audit_log(
        'DRIVER_VEHICLE_APPROVED', 'vehicles', p_vehicle_id::text, NULL,
        jsonb_build_object('status', 'pending', 'current_vehicle_id', v_driver.current_vehicle_id),
        jsonb_build_object('status', 'active', 'current_vehicle_id', p_vehicle_id, 'driver_id', v_driver.id), NULL
    );
END;
$$;
