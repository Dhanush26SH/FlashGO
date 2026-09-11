-- Migration: 20260916000016_cleanup_expired_driver_shifts.sql
-- Description: RPC to safely complete expired driver shifts and sessions

CREATE OR REPLACE FUNCTION public.cleanup_expired_driver_shifts(p_driver_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_end TIMESTAMPTZ;
BEGIN
    IF p_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Find active session for this driver
    SELECT ds.id, ds.staff_shift_id, ss.shift_end
    INTO v_session_id, v_shift_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = p_driver_id AND ds.status = 'active';

    IF v_session_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Check if it is expired
    IF v_shift_end < NOW() THEN
        -- Safely complete it
        UPDATE public.staff_shifts 
        SET status = 'completed', updated_at = NOW() 
        WHERE id = v_shift_id;
        
        UPDATE public.driver_sessions 
        SET status = 'completed', updated_at = NOW() 
        WHERE id = v_session_id;
        
        UPDATE public.profiles 
        SET is_online = false 
        WHERE id = p_driver_id;
        
        RETURN jsonb_build_object('success', true, 'code', 'CLEANED_UP');
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'SESSION_STILL_VALID');
END;
$$;
