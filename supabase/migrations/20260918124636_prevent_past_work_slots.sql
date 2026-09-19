-- Migration: 20260918124636_prevent_past_work_slots.sql
-- Description: Prevent creation of past work slots

CREATE OR REPLACE FUNCTION public.admin_create_work_slot(
    p_warehouse_id UUID,
    p_target_role TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_capacity INT,
    p_status TEXT,
    p_rate_min NUMERIC DEFAULT NULL,
    p_rate_max NUMERIC DEFAULT NULL,
    p_picker_pay_rate NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_id UUID;
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF v_profile.warehouse_id IS NOT NULL THEN
        IF p_warehouse_id != v_profile.warehouse_id THEN
            RAISE EXCEPTION 'Unauthorized: Cannot create slot for another warehouse';
        END IF;
    END IF;

    IF p_start_time <= now() THEN
        RAISE EXCEPTION 'New work slots must start in the future';
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

    IF p_target_role = 'picker' AND p_status = 'published' THEN
        IF p_picker_pay_rate IS NULL OR p_picker_pay_rate <= 0 THEN
            RAISE EXCEPTION 'Picker slots must have a positive pay rate';
        END IF;
    END IF;

    INSERT INTO public.work_slots (
        warehouse_id, target_role, start_time, end_time, capacity, status,
        estimated_hourly_rate_min, estimated_hourly_rate_max, picker_pay_rate
    )
    VALUES (
        p_warehouse_id, p_target_role, p_start_time, p_end_time, p_capacity, p_status,
        p_rate_min, p_rate_max, p_picker_pay_rate
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;
