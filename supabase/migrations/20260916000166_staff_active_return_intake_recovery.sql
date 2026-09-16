-- Migration 20260916000166_staff_active_return_intake_recovery.sql

CREATE OR REPLACE FUNCTION public.staff_get_my_active_return_intake()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_active_shift public.staff_shifts;
    v_active_count INTEGER;
    v_intake public.return_intakes;
    v_driver public.profiles;
BEGIN
    v_staff_id := auth.uid();

    -- 1. Verify Role
    SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- 2. Require Active Shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY start_time DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- 3. Check for multiple active intakes
    SELECT COUNT(*) INTO v_active_count
    FROM public.return_intakes
    WHERE received_by_staff_id = v_staff_id
      AND warehouse_id = v_active_shift.warehouse_id
      AND status IN ('pending', 'scanning');

    IF v_active_count > 1 THEN
        RAISE EXCEPTION 'Conflict: Multiple active return intakes found. Please contact support.';
    END IF;

    IF v_active_count = 0 THEN
        RETURN NULL;
    END IF;

    -- 4. Get the single active intake
    SELECT * INTO v_intake
    FROM public.return_intakes
    WHERE received_by_staff_id = v_staff_id
      AND warehouse_id = v_active_shift.warehouse_id
      AND status IN ('pending', 'scanning')
    LIMIT 1;

    SELECT * INTO v_driver
    FROM public.profiles
    WHERE id = v_intake.driver_id;

    RETURN jsonb_build_object(
        'id', v_intake.id,
        'status', v_intake.status,
        'driver_name', v_driver.full_name
    );
END;
$$;
