-- Migration: 20260921005100_strict_direct_handover_deadline.sql
-- Description: Enforce the authoritative 15-second Picker deadline on all direct-handover driver offers.

CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
BEGIN
    UPDATE public.driver_trip_offers dto
    SET status = 'expired', responded_at = NOW()
    FROM public.logistics_trips lt
    WHERE dto.trip_id = lt.id
      AND dto.status = 'offered'
      AND dto.expires_at <= NOW()
      AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id);

    FOR v_trip IN
        SELECT lt.id, lt.warehouse_id, lt.created_at
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers active_dto
            ON active_dto.trip_id = lt.id AND active_dto.status = 'offered'
        WHERE lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND active_dto.id IS NULL
          AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id)
          -- PHASE 2 EXCLUSION: exclude trips that are safely inside a drop zone allocation
          AND NOT EXISTS (
              SELECT 1 FROM public.drop_zone_allocations dza
              WHERE dza.trip_id = lt.id AND dza.status IN ('allocated', 'placed', 'driver_assigned')
          )
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        -- GUARD: Never create a ghost offer for a trip whose 15-second direct handover window has already expired
        IF (v_trip.created_at + INTERVAL '15 seconds') <= NOW() THEN
            CONTINUE;
        END IF;

        SELECT COUNT(*) INTO v_attempt_count FROM public.driver_trip_offers WHERE trip_id = v_trip.id;

        IF v_attempt_count >= 3 THEN
            UPDATE public.logistics_trips SET status = 'dispatch_failed', updated_at = NOW() WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_driver_id
        FROM public.profiles p
        JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
            AND ss.status = 'active'
            AND ss.warehouse_id = v_trip.warehouse_id
            AND ss.shift_end > NOW()
        WHERE p.role = 'driver'
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips busy
              WHERE busy.driver_id = p.id 
              AND (
                busy.status IN ('accepted', 'in_transit')
                OR (busy.status = 'completed' AND busy.completion_acknowledged_at IS NULL)
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers active_dto
              WHERE active_dto.driver_id = p.id
                AND active_dto.status = 'offered'
                AND active_dto.expires_at > NOW()
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_return_tasks drt
              WHERE drt.driver_id = p.id AND drt.status = 'required'
          )
        ORDER BY
            (SELECT MAX(lt2.updated_at)
             FROM public.logistics_trips lt2
             WHERE lt2.driver_id = p.id AND lt2.status IN ('completed', 'cancelled')
            ) ASC NULLS FIRST,
            ds.updated_at ASC
        FOR UPDATE OF p SKIP LOCKED
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, v_trip.created_at + INTERVAL '15 seconds');
        END IF;
    END LOOP;
END;
$$;
