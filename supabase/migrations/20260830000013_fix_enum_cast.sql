-- Migration: 20260830000013_fix_enum_cast.sql

CREATE OR REPLACE FUNCTION public.get_available_work_slots()
RETURNS TABLE (
    id UUID,
    warehouse_id UUID,
    target_role TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    capacity INT,
    booked_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RETURN; -- Empty result
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count
    FROM public.work_slots ws
    WHERE ws.status = 'published'
      AND ws.start_time > NOW()
      AND ws.warehouse_id = v_profile.warehouse_id
      AND ws.target_role = v_profile.role::TEXT
      -- Exclude slots the worker has already booked
      AND NOT EXISTS (
          SELECT 1 FROM public.staff_shifts my_ss 
          WHERE my_ss.work_slot_id = ws.id 
          AND my_ss.staff_id = auth.uid()
          AND my_ss.status != 'cancelled'
      )
      -- Exclude full slots
      AND ws.capacity > (
          SELECT COUNT(*) FROM public.staff_shifts ss2 
          WHERE ss2.work_slot_id = ws.id AND ss2.status != 'cancelled'
      )
    ORDER BY ws.start_time ASC;
END;
$$;

-- Also fix worker_book_slot which has similar role check
CREATE OR REPLACE FUNCTION public.worker_book_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_slot RECORD;
    v_profile RECORD;
    v_booked_count INT;
BEGIN
    -- 1. Get profile and check suspension
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    IF v_profile.role::TEXT NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Worker role not permitted to book slots';
    END IF;

    -- 2. Lock the slot
    SELECT * INTO v_slot FROM public.work_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    -- 3. Validate slot availability and match
    IF v_slot.status != 'published' THEN
        RAISE EXCEPTION 'Slot is not published';
    END IF;

    IF v_slot.start_time <= NOW() THEN
        RAISE EXCEPTION 'Cannot book a past slot';
    END IF;

    IF v_slot.target_role != v_profile.role::TEXT THEN
        RAISE EXCEPTION 'Role mismatch';
    END IF;

    IF v_slot.warehouse_id != v_profile.warehouse_id THEN
        RAISE EXCEPTION 'Warehouse mismatch';
    END IF;

    -- 4. Duplicate Check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = auth.uid() 
        AND work_slot_id = p_slot_id 
        AND status != 'cancelled'
    ) THEN
        RAISE EXCEPTION 'Worker already booked this slot';
    END IF;

    -- 5. Capacity Check
    SELECT COUNT(*) INTO v_booked_count 
    FROM public.staff_shifts 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';
    
    IF v_booked_count >= v_slot.capacity THEN
        RAISE EXCEPTION 'Slot is full';
    END IF;

    -- 6. Overlap Check
    IF EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = auth.uid()
        AND status != 'cancelled'
        AND shift_start < v_slot.end_time
        AND shift_end > v_slot.start_time
    ) THEN
        RAISE EXCEPTION 'Conflicting shift exists for this time';
    END IF;

    -- 7. Book
    INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
    VALUES (auth.uid(), v_slot.warehouse_id, v_slot.start_time, v_slot.end_time, 'scheduled', p_slot_id);

    RETURN TRUE;
END;
$$;
