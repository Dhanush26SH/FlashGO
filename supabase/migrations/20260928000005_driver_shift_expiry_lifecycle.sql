-- Migration: 20260928000005_driver_shift_expiry_lifecycle.sql
-- Purpose: Implement authoritative server-side driver shift expiry lifecycle.
--   1. Fix driver_return_tasks status CHECK constraint to include at_warehouse
--   2. Concurrency-safe sweep_expired_driver_sessions() cron function
--   3. Schedule new expiry cron job (preserves existing dispatch jobs)
--   4. Fix driver_get_active_delivery for post-shift delivery continuation
--   5. Fix driver_complete_return_to_store: no new trip after shift_end, immediate session close
--   6. Fix driver_expire_shift: add return task guard


-- ============================================================
-- 1. Fix driver_return_tasks status CHECK constraint
--    at_warehouse is already written by driver_verify_warehouse_arrival
--    but was missing from the constraint. Fix without touching existing rows.
-- ============================================================

ALTER TABLE public.driver_return_tasks
DROP CONSTRAINT IF EXISTS driver_return_tasks_status_check;

ALTER TABLE public.driver_return_tasks
ADD CONSTRAINT driver_return_tasks_status_check
CHECK (status = ANY (ARRAY[
    'required'::text,
    'at_warehouse'::text,
    'completed'::text,
    'expired'::text,
    'voided'::text
]));


-- ============================================================
-- 2. sweep_expired_driver_sessions()
--    Called by pg_cron every minute.
--    Concurrency-safe: uses FOR UPDATE SKIP LOCKED to avoid
--    double-closing sessions if foreground driver_expire_shift
--    runs simultaneously for the same driver.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sweep_expired_driver_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
BEGIN
    FOR v_session IN
        SELECT ds.id AS session_id, ds.driver_id
        FROM public.driver_sessions ds
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
        WHERE ds.status = 'active'
          AND ss.shift_end < now()
        FOR UPDATE OF ds SKIP LOCKED
    LOOP
        -- Re-check: no active delivery (idempotency guard)
        IF EXISTS (
            SELECT 1 FROM public.logistics_trips
            WHERE driver_id = v_session.driver_id
              AND status IN ('accepted', 'in_transit')
        ) THEN
            CONTINUE;
        END IF;

        -- Re-check: no unresolved return obligation (idempotency guard)
        IF EXISTS (
            SELECT 1 FROM public.driver_return_tasks
            WHERE driver_id = v_session.driver_id
              AND status IN ('required', 'at_warehouse')
        ) THEN
            CONTINUE;
        END IF;

        -- Close the shift via authoritative reconciler
        PERFORM public.reconcile_worker_shifts(v_session.driver_id);

        -- Set driver offline (bypass online-guard trigger)
        PERFORM set_config('app.driver_status_update_allowed', 'true', true);
        UPDATE public.profiles
        SET is_online = false
        WHERE id = v_session.driver_id
          AND is_online = true;

        -- Close the session; WHERE status guard makes this idempotent
        UPDATE public.driver_sessions
        SET status = 'completed', updated_at = now()
        WHERE id = v_session.session_id
          AND status = 'active';
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_expired_driver_sessions() TO postgres;


-- ============================================================
-- 3. Schedule expiry sweeper as a new pg_cron job.
--    Existing dispatch jobs (flashgo_dispatch_cycle_00/30) are unchanged.
-- ============================================================

SELECT cron.unschedule('flashgo_driver_shift_expiry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flashgo_driver_shift_expiry');

SELECT cron.schedule(
    'flashgo_driver_shift_expiry',
    '* * * * *',
    $$SELECT public.sweep_expired_driver_sessions();$$
);


-- ============================================================
-- 4. Fix driver_get_active_delivery
--    Old version required ss.status = 'active' which broke the pickup
--    screen the moment reconcile_worker_shifts closed the shift.
--    New behaviour:
--      a) Active session, shift still valid -> normal flow.
--      b) Active session, shift ended, driver owns in_transit/accepted delivery
--         -> serve that delivery only (no new waiting-state response).
--      c) Active session, shift ended, no delivery -> NO_ACTIVE_SESSION.
-- ============================================================

CREATE OR REPLACE FUNCTION public.driver_get_active_delivery()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id  UUID := auth.uid();
    v_role       TEXT;
    v_session_id UUID;
    v_shift_end  TIMESTAMPTZ;
    v_shift_valid BOOLEAN;
    v_trip       RECORD;
    v_result     JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_driver_id;
    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    -- Fetch active session + shift_end regardless of shift status.
    -- A shift that was reconciled to 'completed' is still the linked shift
    -- for a session that remains 'active' during an in-progress delivery.
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active'
    LIMIT 1;

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    v_shift_valid := (v_shift_end IS NOT NULL AND v_shift_end > now());

    -- Check for a delivery this driver currently owns
    SELECT lt.id, lt.status, lt.warehouse_id, lt.demo_simulation_completed
    INTO v_trip
    FROM public.logistics_trips lt
    WHERE lt.driver_id = v_driver_id AND lt.status IN ('accepted', 'in_transit')
    LIMIT 1;

    -- Shift ended + no active delivery -> refuse (sweeper will close session)
    IF NOT v_shift_valid AND v_trip.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Shift valid + no delivery -> waiting for a new offer
    IF v_trip.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'trip', NULL);
    END IF;

    -- Build full delivery payload (driver always sees their own active delivery
    -- regardless of whether the shift has since ended)
    SELECT jsonb_build_object(
        'success', true,
        'trip', jsonb_build_object(
            'id', lt.id,
            'status', lt.status,
            'demo_simulation_completed', COALESCE(lt.demo_simulation_completed, false)
        ),
        'warehouse', jsonb_build_object(
            'id', w.id,
            'name', w.name,
            'address', w.address,
            'latitude', w.lat,
            'longitude', w.lng
        ),
        'order', jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'status', o.status,
            'total_amount', o.total_amount,
            'payment_method', o.payment_method,
            'payment_status', o.payment_status,
            'picker_name', COALESCE(picker.full_name, 'Assigning'),
            'customer_name', COALESCE(o.customer_snapshot_name, o.customer_name_snapshot, cust.full_name),
            'customer_phone', COALESCE(o.customer_snapshot_phone, cust.phone),
            'delivery_address', o.delivery_address,
            'delivery_lat', o.delivery_lat,
            'delivery_lng', o.delivery_lng,
            'picker_ready', (o.status = 'handed_off'),
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', oi.id,
                    'product_name', p.name,
                    'quantity', oi.quantity,
                    'price', oi.price
                ))
                FROM public.order_items oi
                JOIN public.products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
            ),
            'total_item_count', (
                SELECT SUM(oi.quantity)
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            )
        )
    ) INTO v_result
    FROM public.logistics_trips lt
    JOIN public.warehouses w ON w.id = lt.warehouse_id
    JOIN public.orders o ON o.trip_id = lt.id
    LEFT JOIN public.profiles picker ON picker.id = o.picker_id
    LEFT JOIN public.profiles cust ON cust.id = o.customer_id
    WHERE lt.id = v_trip.id
      AND o.status NOT IN ('cancelled')
    LIMIT 1;

    IF v_result IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND');
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_get_active_delivery() TO authenticated;


-- ============================================================
-- 5. Fix driver_complete_return_to_store
--    - Warehouse QR requirement preserved.
--    - Completes the return task.
--    - If shift_end has passed: skip drop-zone assignment; close session immediately.
--    - If shift still valid: existing drop-zone reassignment logic applies.
-- ============================================================

CREATE OR REPLACE FUNCTION public.driver_complete_return_to_store(
    p_qr_token TEXT,
    p_lat FLOAT,
    p_lng FLOAT,
    p_is_demo BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id       UUID := auth.uid();
    v_task            RECORD;
    v_warehouse       RECORD;
    v_distance_meters FLOAT;
    v_qr_id           UUID;
    v_waiting_alloc   RECORD;
    v_shift_end       TIMESTAMPTZ;
    v_shift_ended     BOOLEAN;
BEGIN
    -- Lock the oldest unresolved return task for this driver
    SELECT drt.* INTO v_task
    FROM public.driver_return_tasks drt
    WHERE drt.driver_id = v_driver_id
      AND drt.status IN ('required', 'at_warehouse')
    ORDER BY drt.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    IF v_warehouse.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_NOT_FOUND');
    END IF;

    -- Distance is calculated for audit purposes only (UNIVERSAL BYPASS active)
    v_distance_meters := public.calculate_haversine_distance(
        p_lat, p_lng, v_warehouse.lat, v_warehouse.lng
    );

    -- QR token is an authoritative gate — no bypass
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_task.warehouse_id
      AND raw_token = p_qr_token
      AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    -- Complete the return task
    UPDATE public.driver_return_tasks
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_task.id;

    -- Determine whether the shift is still active
    SELECT ss.shift_end INTO v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active'
    LIMIT 1;

    v_shift_ended := (v_shift_end IS NULL OR v_shift_end <= now());

    IF v_shift_ended THEN
        -- Shift has passed: close session immediately, do NOT assign a new trip
        PERFORM public.reconcile_worker_shifts(v_driver_id);

        PERFORM set_config('app.driver_status_update_allowed', 'true', true);
        UPDATE public.profiles
        SET is_online = false
        WHERE id = v_driver_id;

        UPDATE public.driver_sessions
        SET status = 'completed', updated_at = NOW()
        WHERE driver_id = v_driver_id AND status = 'active';

        RETURN jsonb_build_object('success', true, 'code', 'SHIFT_ENDED_SESSION_CLOSED');
    ELSE
        -- Shift still valid: offer a waiting drop-zone trip if one exists
        SELECT dza.* INTO v_waiting_alloc
        FROM public.drop_zone_allocations dza
        WHERE dza.warehouse_id = v_warehouse.id AND dza.status = 'placed'
        ORDER BY dza.placed_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_waiting_alloc.id IS NOT NULL THEN
            UPDATE public.drop_zone_allocations
            SET status = 'driver_assigned',
                driver_id = v_driver_id,
                driver_assigned_at = NOW()
            WHERE id = v_waiting_alloc.id;

            UPDATE public.logistics_trips
            SET status = 'accepted', driver_id = v_driver_id, updated_at = NOW()
            WHERE id = v_waiting_alloc.trip_id;

            UPDATE public.orders
            SET driver_id = v_driver_id, updated_at = NOW()
            WHERE id = v_waiting_alloc.order_id;
        END IF;

        RETURN jsonb_build_object('success', true);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_complete_return_to_store(TEXT, FLOAT, FLOAT, BOOLEAN) TO authenticated;


-- ============================================================
-- 6. Fix driver_expire_shift: add return task guard
--    Frontend (DriverOperationsMapScreen.tsx line 52) already handles
--    'RETURN_TASK_IN_PROGRESS' identically to 'ACTIVE_DELIVERY_IN_PROGRESS'.
--    Also removed the unnecessarily wide 5-minute post-shift grace window
--    from the is_online check; the shift reconciliation is authoritative.
-- ============================================================

CREATE OR REPLACE FUNCTION public.driver_expire_shift()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_uid  UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;

    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ROLE');
    END IF;

    -- Mark expired shifts as completed
    PERFORM public.reconcile_worker_shifts(v_uid);

    -- Guard 1: active delivery must finish before session is closed
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = v_uid AND status IN ('accepted', 'in_transit')
    ) THEN
        RETURN jsonb_build_object('success', true, 'code', 'ACTIVE_DELIVERY_IN_PROGRESS');
    END IF;

    -- Guard 2: unresolved return obligation must complete before session is closed
    IF EXISTS (
        SELECT 1 FROM public.driver_return_tasks
        WHERE driver_id = v_uid AND status IN ('required', 'at_warehouse')
    ) THEN
        RETURN jsonb_build_object('success', true, 'code', 'RETURN_TASK_IN_PROGRESS');
    END IF;

    -- Safe to expire: offline + close session if shift has genuinely ended
    IF NOT EXISTS (
        SELECT 1 FROM public.staff_shifts
        WHERE staff_id = v_uid
          AND status = 'active'
          AND now() < shift_end
    ) THEN
        PERFORM set_config('app.driver_status_update_allowed', 'true', true);
        UPDATE public.profiles SET is_online = false WHERE id = v_uid;

        UPDATE public.driver_sessions
        SET status = 'completed', updated_at = NOW()
        WHERE driver_id = v_uid AND status = 'active';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_expire_shift() TO authenticated;
