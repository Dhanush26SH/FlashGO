-- Migration: 20260830000012_fix_rpc_ambiguous_id.sql

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
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
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
