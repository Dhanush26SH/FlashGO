-- Migration: 20260830000006_enhance_shift_management.sql

-- 1. Create RPC to update shift details
CREATE OR REPLACE FUNCTION public.admin_update_shift_details(
    p_shift_id UUID,
    p_staff_id UUID,
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
    -- Auth check
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_shift_end <= p_shift_start THEN
        RAISE EXCEPTION 'Shift end must be after shift start';
    END IF;

    -- Staff validity
    SELECT role INTO v_role FROM public.profiles WHERE id = p_staff_id;
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Overlap check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = p_staff_id
        AND id != p_shift_id
        AND status != 'cancelled'
        AND shift_start < p_shift_end
        AND shift_end > p_shift_start
    ) THEN
        RAISE EXCEPTION 'Conflicting shift exists for this staff member';
    END IF;

    UPDATE public.staff_shifts 
    SET staff_id = p_staff_id,
        shift_start = p_shift_start,
        shift_end = p_shift_end
    WHERE id = p_shift_id;
    
    RETURN TRUE;
END;
$$;

-- 2. Add overlap check to existing create_shift RPC
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

    -- Overlap check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = p_staff_id
        AND status != 'cancelled'
        AND shift_start < p_shift_end
        AND shift_end > p_shift_start
    ) THEN
        RAISE EXCEPTION 'Conflicting shift exists for this staff member';
    END IF;

    INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status)
    VALUES (p_staff_id, p_warehouse_id, p_shift_start, p_shift_end, 'scheduled');

    RETURN TRUE;
END;
$$;
