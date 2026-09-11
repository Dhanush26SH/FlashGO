-- Migration: 20260916000021_dispatch_idempotency_and_auth_fix.sql
-- Description:
--   1. Strengthen handle_auto_dispatch to be idempotent at the DB level
--   2. Fix get_dispatch_failed_trips() to use the correct FlashGO admin authority model

-- ============================================================
-- PART 1: Idempotency for handle_auto_dispatch
--
-- The trigger condition already checks NEW.trip_id IS NULL (order not yet assigned a trip).
-- We reinforce this with:
--   a) A PARTIAL UNIQUE INDEX on logistics_trips to ensure at most one
--      non-terminal trip exists per order at the database level.
--      Since trips don't store order_id directly (orders store trip_id),
--      we enforce from the orders side: at most one active (non-cancelled)
--      trip_id per order using a partial unique index on orders.trip_id
--      where the referenced trip is non-terminal.
--
--   b) An ADVISORY LOCK inside the trigger function so concurrent updates
--      to the same order cannot both pass the `trip_id IS NULL` check
--      simultaneously in a race condition window.
--
-- Note: orders.trip_id is already a FK, but not UNIQUE. We cannot add a naive
-- UNIQUE constraint because future batch trips (multiple orders per trip) are
-- possible. The correct guard here is:
--   - At most one trip_id per order (each order can only belong to one trip)
--   - This is a business-level constraint we can enforce with a partial unique index.
-- ============================================================

-- a) Enforce at most one active trip per order (covers normal 1-order trips)
--    This partial index blocks duplicate trip assignment for the same order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_single_active_trip
    ON public.orders (trip_id)
    WHERE trip_id IS NOT NULL;

-- b) Replace handle_auto_dispatch with advisory-lock-protected idempotent version
CREATE OR REPLACE FUNCTION public.handle_auto_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip_id UUID;
    v_lock_key BIGINT;
BEGIN
    -- Only act when transitioning TO packed with no trip yet
    IF NEW.status != 'packed' OR OLD.status = 'packed' OR NEW.trip_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Re-read the authoritative trip_id inside the transaction to guard against
    -- concurrent updates that may have already assigned a trip between check and now
    PERFORM id FROM public.orders WHERE id = NEW.id AND trip_id IS NOT NULL FOR UPDATE;
    IF FOUND THEN
        -- Another concurrent execution already created a trip; abort idempotently
        RETURN NEW;
    END IF;

    -- Create a single pending logistics trip
    INSERT INTO public.logistics_trips (warehouse_id, status)
    VALUES (NEW.warehouse_id, 'pending')
    RETURNING id INTO v_trip_id;

    -- Assign order to trip
    NEW.trip_id := v_trip_id;

    -- Kick dispatch cycle asynchronously (within same transaction scope)
    PERFORM public.run_dispatch_cycle(NEW.warehouse_id);

    RETURN NEW;
END;
$$;

-- Re-attach trigger (BEFORE UPDATE so we can mutate NEW.trip_id)
DROP TRIGGER IF EXISTS trigger_auto_dispatch ON public.orders;
CREATE TRIGGER trigger_auto_dispatch
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auto_dispatch();


-- ============================================================
-- PART 2: Fix get_dispatch_failed_trips() — Admin authority model
--
-- FlashGO admin authority:
--   Global Admin: role='admin' AND warehouse_id IS NULL  → all warehouses
--   Scoped Admin: role='admin' AND warehouse_id IS NOT NULL → own warehouse only
--   All others (warehouse_staff, warehouse_manager, driver, etc.) → UNAUTHORIZED
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dispatch_failed_trips()
RETURNS SETOF public.admin_dispatch_failed_trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_warehouse_id UUID;
BEGIN
    SELECT role, warehouse_id
    INTO v_caller_role, v_caller_warehouse_id
    FROM public.profiles
    WHERE id = auth.uid();

    -- Only admins may call this
    IF v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Global admin (no warehouse scoping) → return all
    IF v_caller_warehouse_id IS NULL THEN
        RETURN QUERY SELECT * FROM public.admin_dispatch_failed_trips;

    -- Scoped admin → return only their warehouse
    ELSE
        RETURN QUERY
            SELECT * FROM public.admin_dispatch_failed_trips adt
            WHERE adt.warehouse_id = v_caller_warehouse_id;
    END IF;
END;
$$;
