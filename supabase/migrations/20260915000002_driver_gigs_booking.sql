-- Add estimated hourly rates to work_slots
ALTER TABLE public.work_slots 
ADD COLUMN IF NOT EXISTS estimated_hourly_rate_min NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS estimated_hourly_rate_max NUMERIC(10,2);

ALTER TABLE public.work_slots
ADD CONSTRAINT chk_work_slots_rates 
CHECK (
  (estimated_hourly_rate_min IS NULL AND estimated_hourly_rate_max IS NULL) OR 
  (estimated_hourly_rate_min >= 0 AND estimated_hourly_rate_max >= estimated_hourly_rate_min)
);

-- RPC for drivers to batch book gigs securely across active stores
CREATE OR REPLACE FUNCTION public.driver_book_gigs(p_slot_ids UUID[])
RETURNS TABLE (
    shift_id UUID,
    slot_id UUID,
    warehouse_id UUID,
    warehouse_name TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    estimated_hourly_rate_min NUMERIC,
    estimated_hourly_rate_max NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
    v_slot_id UUID;
    v_booked_count INT;
    v_warehouse_active BOOLEAN;
    v_new_shift_id UUID;
    v_processed_slots UUID[] := '{}';
    v_overlapping BOOLEAN;
BEGIN
    -- Enforce array is not empty
    IF array_length(p_slot_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No slots selected';
    END IF;

    -- Check driver
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN
        RAISE EXCEPTION 'Worker is not an active driver';
    END IF;

    -- Process unique slots in deterministic order to prevent deadlocks
    FOR v_slot_id IN (SELECT DISTINCT unnest(p_slot_ids) ORDER BY 1) LOOP
        
        -- 1. Lock and fetch slot
        SELECT * INTO v_slot FROM public.work_slots WHERE id = v_slot_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Slot % not found', v_slot_id;
        END IF;

        -- 2. Basic validations
        IF v_slot.status != 'published' THEN
            RAISE EXCEPTION 'Slot is not published';
        END IF;

        IF v_slot.start_time <= NOW() THEN
            RAISE EXCEPTION 'Cannot book a past slot';
        END IF;

        IF v_slot.target_role != 'driver' THEN
            RAISE EXCEPTION 'Slot is not for drivers';
        END IF;

        -- 3. Check active warehouse eligibility for drivers
        SELECT is_active INTO v_warehouse_active FROM public.warehouses WHERE id = v_slot.warehouse_id;
        IF v_warehouse_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Store is not active for booking';
        END IF;

        -- 4. Capacity
        SELECT COUNT(*) INTO v_booked_count 
        FROM public.staff_shifts 
        WHERE work_slot_id = v_slot_id AND status != 'cancelled';
        
        IF v_booked_count >= v_slot.capacity THEN
            RAISE EXCEPTION 'Slot is full';
        END IF;

        -- 5. Duplicate Check
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = auth.uid() 
            AND work_slot_id = v_slot_id 
            AND status != 'cancelled'
        ) THEN
            RAISE EXCEPTION 'Already booked this slot';
        END IF;

        -- 6. Overlap with existing shifts
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = auth.uid()
            AND status != 'cancelled'
            AND shift_start < v_slot.end_time
            AND shift_end > v_slot.start_time
        ) THEN
            RAISE EXCEPTION 'Conflicting shift exists for this time';
        END IF;

        -- 7. Overlap within the requested batch itself
        -- We check against other slots in p_slot_ids that are not v_slot_id
        SELECT EXISTS (
            SELECT 1 FROM public.work_slots ws2
            WHERE ws2.id = ANY(p_slot_ids)
            AND ws2.id != v_slot_id
            AND ws2.start_time < v_slot.end_time
            AND ws2.end_time > v_slot.start_time
        ) INTO v_overlapping;

        IF v_overlapping THEN
            RAISE EXCEPTION 'Selected slots overlap with each other';
        END IF;

        -- 8. Book
        INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
        VALUES (auth.uid(), v_slot.warehouse_id, v_slot.start_time, v_slot.end_time, 'scheduled', v_slot_id)
        RETURNING id INTO v_new_shift_id;
        
        -- Store the result in a temporary array or temp table to return later
        -- Actually, since Postgres PL/pgSQL function returning TABLE can just do RETURN QUERY inside the loop.
        RETURN QUERY 
        SELECT 
            v_new_shift_id AS shift_id,
            v_slot_id AS slot_id,
            v_slot.warehouse_id AS warehouse_id,
            (SELECT name FROM public.warehouses WHERE id = v_slot.warehouse_id) AS warehouse_name,
            v_slot.start_time AS start_time,
            v_slot.end_time AS end_time,
            v_slot.estimated_hourly_rate_min AS estimated_hourly_rate_min,
            v_slot.estimated_hourly_rate_max AS estimated_hourly_rate_max;
            
    END LOOP;

    RETURN;
END;
$$;

-- Also update get_available_work_slots to include these new fields and support drivers crossing stores
-- But we can just create a dedicated one for drivers to avoid touching the picker one and violating the rule "Preserve Picker warehouse restriction unchanged"
CREATE OR REPLACE FUNCTION public.get_available_driver_gigs()
RETURNS TABLE(
    id uuid, 
    warehouse_id uuid, 
    warehouse_name text,
    target_role text, 
    start_time timestamp with time zone, 
    end_time timestamp with time zone, 
    capacity integer, 
    booked_count bigint,
    estimated_hourly_rate_min numeric,
    estimated_hourly_rate_max numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN
        RETURN;
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
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count,
        ws.estimated_hourly_rate_min,
        ws.estimated_hourly_rate_max
    FROM public.work_slots ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE ws.status = 'published'
      AND ws.start_time > NOW()
      AND ws.target_role = 'driver'
      AND w.is_active = true
      -- Exclude slots the driver has already booked
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
$function$;
