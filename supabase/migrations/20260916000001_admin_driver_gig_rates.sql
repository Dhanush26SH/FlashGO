-- Migration: 20260916000001_admin_driver_gig_rates.sql

-- 1. Create Work Slot
CREATE OR REPLACE FUNCTION public.admin_create_work_slot(
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT,
    p_rate_min NUMERIC DEFAULT NULL,
    p_rate_max NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id UUID;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL THEN
        IF p_warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot create slot for another warehouse';
        END IF;
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    IF p_target_role = 'driver' AND p_status = 'published' THEN
        IF p_rate_min IS NULL OR p_rate_max IS NULL THEN
            RAISE EXCEPTION 'Driver gigs must have minimum and maximum estimated hourly rates when published';
        END IF;
        IF p_rate_min < 0 THEN
            RAISE EXCEPTION 'Minimum hourly rate cannot be negative';
        END IF;
        IF p_rate_max < p_rate_min THEN
            RAISE EXCEPTION 'Maximum hourly rate cannot be less than minimum hourly rate';
        END IF;
    END IF;

    INSERT INTO public.work_slots (
        warehouse_id, target_role, start_time, end_time, capacity, status,
        estimated_hourly_rate_min, estimated_hourly_rate_max
    )
    VALUES (
        p_warehouse_id, p_target_role, p_start_time, p_end_time, p_capacity, p_status,
        p_rate_min, p_rate_max
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;


-- 2. Edit Work Slot
CREATE OR REPLACE FUNCTION public.admin_edit_work_slot(
    p_slot_id UUID,
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT,
    p_rate_min NUMERIC DEFAULT NULL,
    p_rate_max NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slot RECORD;
    v_booked_count INT;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL THEN
        IF v_slot.warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot edit slot from another warehouse';
        END IF;
        IF p_warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot move slot to another warehouse';
        END IF;
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;

    IF p_target_role = 'driver' AND p_status = 'published' THEN
        IF p_rate_min IS NULL OR p_rate_max IS NULL THEN
            RAISE EXCEPTION 'Driver gigs must have minimum and maximum estimated hourly rates when published';
        END IF;
        IF p_rate_min < 0 THEN
            RAISE EXCEPTION 'Minimum hourly rate cannot be negative';
        END IF;
        IF p_rate_max < p_rate_min THEN
            RAISE EXCEPTION 'Maximum hourly rate cannot be less than minimum hourly rate';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_booked_count 
    FROM public.staff_shifts 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';

    IF p_capacity < v_booked_count THEN
        RAISE EXCEPTION 'Cannot reduce capacity below currently active bookings';
    END IF;

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
        
        IF (p_rate_min IS DISTINCT FROM v_slot.estimated_hourly_rate_min) OR (p_rate_max IS DISTINCT FROM v_slot.estimated_hourly_rate_max) THEN
            RAISE EXCEPTION 'Cannot change estimated hourly rates because active bookings exist. Cancel slot instead.';
        END IF;
    END IF;

    UPDATE public.work_slots 
    SET warehouse_id = p_warehouse_id,
        target_role = p_target_role,
        start_time = p_start_time,
        end_time = p_end_time,
        capacity = p_capacity,
        status = p_status,
        estimated_hourly_rate_min = p_rate_min,
        estimated_hourly_rate_max = p_rate_max,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN TRUE;
END;
$$;


-- 3. Get Work Slots
CREATE OR REPLACE FUNCTION public.admin_get_work_slots()
RETURNS TABLE (
    id UUID,
    warehouse_id UUID,
    warehouse_name TEXT,
    target_role TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    capacity INT,
    status TEXT,
    booked_count BIGINT,
    estimated_hourly_rate_min NUMERIC,
    estimated_hourly_rate_max NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        w.name AS warehouse_name,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        ws.status,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count,
        ws.estimated_hourly_rate_min,
        ws.estimated_hourly_rate_max
    FROM public.work_slots ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE (v_profile.warehouse_id IS NULL OR ws.warehouse_id = v_profile.warehouse_id)
    ORDER BY ws.start_time DESC;
END;
$$;


-- 4. Cancel Work Slot
CREATE OR REPLACE FUNCTION public.admin_cancel_work_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL AND v_slot.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot cancel slot for another warehouse';
    END IF;

    UPDATE public.work_slots SET status = 'cancelled', updated_at = NOW() WHERE id = p_slot_id;
    
    UPDATE public.staff_shifts 
    SET status = 'cancelled' 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';

    RETURN TRUE;
END;
$$;
