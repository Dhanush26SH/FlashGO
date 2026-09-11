-- Migration: 20260830000007_work_slot_management.sql

-- 1. Create work_slots table
CREATE TABLE IF NOT EXISTS public.work_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    target_role TEXT NOT NULL CHECK (target_role IN ('picker', 'driver', 'warehouse_staff')),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'unpublished' CHECK (status IN ('published', 'unpublished', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

ALTER TABLE public.work_slots ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to work_slots" ON public.work_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Staff can SELECT published work_slots (filtered by RPCs usually, but just in case)
CREATE POLICY "Staff can view published slots" ON public.work_slots FOR SELECT USING (
  status = 'published' AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_suspended = false AND role IN ('picker', 'driver', 'warehouse_staff')
  )
);

-- 2. Add work_slot_id to staff_shifts
ALTER TABLE public.staff_shifts
ADD COLUMN work_slot_id UUID REFERENCES public.work_slots(id) ON DELETE RESTRICT;

-- 3. Worker Book Slot RPC
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

    IF v_profile.role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
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

    IF v_slot.target_role != v_profile.role THEN
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

-- 4. Worker Cancel Booking RPC
CREATE OR REPLACE FUNCTION public.worker_cancel_booking(p_shift_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
BEGIN
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized to cancel this shift';
    END IF;

    IF v_shift.shift_start <= NOW() THEN
        RAISE EXCEPTION 'Cannot cancel a shift that has already started or is in the past';
    END IF;

    UPDATE public.staff_shifts SET status = 'cancelled' WHERE id = p_shift_id;

    RETURN TRUE;
END;
$$;

-- 5. Admin Cancel Slot RPC
CREATE OR REPLACE FUNCTION public.admin_cancel_work_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Auth check
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE public.work_slots SET status = 'cancelled', updated_at = NOW() WHERE id = p_slot_id;
    
    -- Cascading cancellation to active bookings
    UPDATE public.staff_shifts 
    SET status = 'cancelled' 
    WHERE work_slot_id = p_slot_id AND status != 'cancelled';

    RETURN TRUE;
END;
$$;

-- 6. RPC for fetching available work slots (worker)
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
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
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
      AND ws.target_role = v_profile.role
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

-- 7. RPC for fetching worker's own booked slots (worker)
CREATE OR REPLACE FUNCTION public.get_my_work_slots()
RETURNS TABLE (
    shift_id UUID,
    work_slot_id UUID,
    warehouse_id UUID,
    shift_start TIMESTAMPTZ,
    shift_end TIMESTAMPTZ,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.id AS shift_id,
        ss.work_slot_id,
        ss.warehouse_id,
        ss.shift_start,
        ss.shift_end,
        ss.status
    FROM public.staff_shifts ss
    WHERE ss.staff_id = auth.uid()
    ORDER BY ss.shift_start ASC;
END;
$$;

-- 8. Admin Get All Work Slots (with counts)
CREATE OR REPLACE FUNCTION public.admin_get_work_slots()
RETURNS TABLE (
    id UUID,
    warehouse_id UUID,
    target_role TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    capacity INT,
    status TEXT,
    booked_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        ws.status,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count
    FROM public.work_slots ws
    ORDER BY ws.start_time DESC;
END;
$$;

