-- Migration: 20260916000076_driver_expire_shift.sql
-- Expose a secure client-callable RPC that a Driver can call to
-- reconcile their own expired shifts and go offline atomically.
-- This handles active deliveries gracefully.

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

    -- Run the authoritative shift reconciliation for this worker.
    PERFORM public.reconcile_worker_shifts(v_uid);

    -- Check for active deliveries
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips 
        WHERE driver_id = v_uid AND status IN ('accepted', 'in_transit')
    ) THEN
        -- If they have an active delivery, we DO NOT force them offline or close the session yet.
        -- They must finish the delivery first.
        RETURN jsonb_build_object('success', true, 'code', 'ACTIVE_DELIVERY_IN_PROGRESS');
    END IF;

    -- If the driver is still online but now has no valid active shift, force them offline.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_online = true) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = v_uid
              AND status = 'active'
              AND now() < shift_end + interval '5 minutes'
        ) THEN
            PERFORM set_config('app.driver_status_update_allowed', 'true', true);
            UPDATE public.profiles SET is_online = false WHERE id = v_uid;
            
            -- Also close the driver session
            UPDATE public.driver_sessions 
            SET status = 'completed', updated_at = NOW() 
            WHERE driver_id = v_uid AND status = 'active';
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_expire_shift() TO authenticated;
