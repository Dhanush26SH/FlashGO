-- Migration: 20260830000008_admin_work_slots.sql

-- Admin Create Work Slot
CREATE OR REPLACE FUNCTION public.admin_create_work_slot(
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
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

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    INSERT INTO public.work_slots (warehouse_id, target_role, start_time, end_time, capacity, status)
    VALUES (p_warehouse_id, p_target_role, p_start_time, p_end_time, p_capacity, p_status);

    RETURN TRUE;
END;
$$;

-- Admin Edit Work Slot (Handles structural protections)
CREATE OR REPLACE FUNCTION public.admin_edit_work_slot(
    p_slot_id UUID,
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slot RECORD;
    v_booked_count INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    -- Get booked count
    SELECT COUNT(*) INTO v_booked_count 
    FROM public.staff_shifts 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';

    -- Capacity check: cannot reduce below booked
    IF p_capacity < v_booked_count THEN
        RAISE EXCEPTION 'Cannot reduce capacity below currently active bookings';
    END IF;

    -- Structural edit checks if there are bookings
    IF v_booked_count > 0 THEN
        IF p_warehouse_id != v_slot.warehouse_id THEN
            RAISE EXCEPTION 'Cannot change warehouse because active bookings exist. Cancel slot instead.';
        END IF;
        IF p_target_role != v_slot.target_role THEN
            RAISE EXCEPTION 'Cannot change target role because active bookings exist. Cancel slot instead.';
        END IF;
        IF p_start_time != v_slot.start_time OR p_end_time != v_slot.end_time THEN
            RAISE EXCEPTION 'Cannot change time because active bookings exist. Cancel slot instead.';
        END IF;
    END IF;

    UPDATE public.work_slots 
    SET warehouse_id = p_warehouse_id,
        target_role = p_target_role,
        start_time = p_start_time,
        end_time = p_end_time,
        capacity = p_capacity,
        status = p_status,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN TRUE;
END;
$$;
