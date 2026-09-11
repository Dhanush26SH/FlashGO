-- Migration: 20260830000009_fix_shift_update.sql

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
    v_shift RECORD;
BEGIN
    -- Auth check
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    -- Block structural edits on slot-backed shifts
    IF v_shift.work_slot_id IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot structurally edit a slot-backed shift directly. Edit the slot instead.';
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
