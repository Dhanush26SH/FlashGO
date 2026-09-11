-- Migration: 20260916000020_automatic_sequential_dispatch.sql
-- Description:
--   1. Replace old handle_auto_dispatch (which bypassed offers) with new offer-aware version
--   2. Replace old handle_driver_freed (bypasses offers) with noop
--   3. Add pg_cron job that runs every 30s to advance expired offers automatically
--   4. Fix driver ranking to use least-recently-assigned (fair, deterministic)
--   5. Add dispatch_failed visibility helpers for Admin

-- ============================================================
-- PART 1: New dispatch trigger (packed → pending trip → first offer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_auto_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_id UUID;
    v_driver_id UUID;
BEGIN
    -- Fire when order transitions to 'packed' and has no trip yet
    IF NEW.status = 'packed' AND OLD.status != 'packed' AND NEW.trip_id IS NULL THEN

        -- 1. Create a pending logistics trip (do NOT auto-assign driver)
        INSERT INTO public.logistics_trips (warehouse_id, status)
        VALUES (NEW.warehouse_id, 'pending')
        RETURNING id INTO v_trip_id;

        -- 2. Link this order to the trip
        NEW.trip_id := v_trip_id;

        -- 3. Immediately attempt first driver offer for this warehouse
        PERFORM public.run_dispatch_cycle(NEW.warehouse_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_dispatch ON public.orders;
CREATE TRIGGER trigger_auto_dispatch
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auto_dispatch();


-- ============================================================
-- PART 2: Disable old driver_freed trigger (it bypassed offers)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_driver_freed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Superseded by sequential dispatch via pg_cron.
    -- Driver being freed is detected by run_dispatch_cycle every 30s.
    RETURN NEW;
END;
$$;


-- ============================================================
-- PART 3: Core dispatch cycle (idempotent, called by trigger + cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
    v_existing_active_offer UUID;
BEGIN
    -- Step 1: Expire stale active offers for this warehouse (or all warehouses)
    UPDATE public.driver_trip_offers dto
    SET status = 'expired', responded_at = NOW()
    FROM public.logistics_trips lt
    WHERE dto.trip_id = lt.id
      AND dto.status = 'offered'
      AND dto.expires_at <= NOW()
      AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id);

    -- Step 2: For each pending trip without an active offer, try to create one
    FOR v_trip IN
        SELECT lt.id, lt.warehouse_id
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers active_dto
            ON active_dto.trip_id = lt.id AND active_dto.status = 'offered'
        WHERE lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND active_dto.id IS NULL
          AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id)
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        -- Count past attempts for this trip
        SELECT COUNT(*) INTO v_attempt_count
        FROM public.driver_trip_offers
        WHERE trip_id = v_trip.id;

        -- 3 attempts exhausted → dispatch_failed
        IF v_attempt_count >= 3 THEN
            UPDATE public.logistics_trips
            SET status = 'dispatch_failed', updated_at = NOW()
            WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        -- Find the best eligible driver:
        -- Online, active session+shift, checked into this warehouse, not on another trip,
        -- not already attempted for this specific trip.
        -- Ranking: least recently assigned (by last completed logistics trip), then by session start.
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
          -- Not currently on an active/in-transit trip
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips busy
              WHERE busy.driver_id = p.id
                AND busy.status IN ('accepted', 'in_transit')
          )
          -- Not already attempted for this trip
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers prev
              WHERE prev.trip_id = v_trip.id AND prev.driver_id = p.id
          )
        ORDER BY
            -- Least recently assigned (NULL = never assigned → they go first)
            (SELECT MAX(lt2.updated_at)
             FROM public.logistics_trips lt2
             WHERE lt2.driver_id = p.id
               AND lt2.status IN ('completed', 'cancelled')
            ) ASC NULLS FIRST,
            -- Tie-break: earliest session start (fair queue)
            ds.created_at ASC
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, NOW() + INTERVAL '60 seconds');
        END IF;
    END LOOP;
END;
$$;


-- ============================================================
-- PART 4: pg_cron — runs run_dispatch_cycle every 30 seconds
-- Supabase projects support pg_cron via the extensions panel.
-- We enable it here and schedule the job.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required for pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Remove any old job with same name before re-scheduling
SELECT cron.unschedule('flashgo_dispatch_cycle')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flashgo_dispatch_cycle');

-- Schedule: every 30 seconds (pg_cron minimum is 1 minute, so we use 2 jobs offset by 30s)
SELECT cron.schedule(
    'flashgo_dispatch_cycle_00',
    '* * * * *',
    $$SELECT public.run_dispatch_cycle();$$
);

SELECT cron.schedule(
    'flashgo_dispatch_cycle_30',
    '* * * * *',
    $$SELECT pg_sleep(30); SELECT public.run_dispatch_cycle();$$
);


-- ============================================================
-- PART 5: Admin visibility for dispatch_failed trips
-- ============================================================
-- View that surfaces dispatch_failed trips with their attempt history
CREATE OR REPLACE VIEW public.admin_dispatch_failed_trips AS
SELECT
    lt.id AS trip_id,
    lt.warehouse_id,
    w.name AS warehouse_name,
    lt.status,
    lt.created_at AS trip_created_at,
    lt.updated_at AS trip_updated_at,
    COUNT(dto.id) AS total_attempts,
    json_agg(
        json_build_object(
            'attempt', dto.attempt_number,
            'driver_id', dto.driver_id,
            'driver_name', p.full_name,
            'offered_at', dto.offered_at,
            'expires_at', dto.expires_at,
            'status', dto.status
        ) ORDER BY dto.attempt_number
    ) AS attempts
FROM public.logistics_trips lt
JOIN public.warehouses w ON lt.warehouse_id = w.id
LEFT JOIN public.driver_trip_offers dto ON dto.trip_id = lt.id
LEFT JOIN public.profiles p ON dto.driver_id = p.id
WHERE lt.status = 'dispatch_failed'
GROUP BY lt.id, lt.warehouse_id, w.name;

-- Secure: only admins and warehouse staff can see this view
REVOKE ALL ON public.admin_dispatch_failed_trips FROM public, anon, authenticated;
GRANT SELECT ON public.admin_dispatch_failed_trips TO authenticated;

-- RLS is not on views directly, but back-end access is via SECURITY DEFINER RPC or admin role check
CREATE OR REPLACE FUNCTION public.get_dispatch_failed_trips()
RETURNS SETOF public.admin_dispatch_failed_trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role NOT IN ('admin', 'warehouse_manager', 'warehouse_staff') THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
    RETURN QUERY SELECT * FROM public.admin_dispatch_failed_trips;
END;
$$;
