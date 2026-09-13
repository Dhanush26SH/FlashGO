-- Migration: 20260916000075_picker_expire_shift.sql
-- Expose a secure client-callable RPC that a Picker can call to
-- reconcile their own expired shifts and go offline atomically.
-- This is the authoritative server-side mechanism for client-initiated shift expiry.

CREATE OR REPLACE FUNCTION public.picker_expire_shift()
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

    IF v_role NOT IN ('picker', 'warehouse_staff') THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ROLE');
    END IF;

    -- Run the authoritative shift reconciliation for this worker.
    -- This marks any expired active shift as 'completed'.
    PERFORM public.reconcile_worker_shifts(v_uid);

    -- If the picker is still online but now has no valid active shift, force them offline.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_online = true) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = v_uid
              AND status = 'active'
              AND now() < shift_end + interval '5 minutes'
        ) THEN
            -- Bypass the protective trigger via app.driver_status_update_allowed
            PERFORM set_config('app.driver_status_update_allowed', 'true', true);
            UPDATE public.profiles SET is_online = false WHERE id = v_uid;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to authenticated users (pickers call this on themselves)
GRANT EXECUTE ON FUNCTION public.picker_expire_shift() TO authenticated;
