-- Migration: 20260916000046_picker_toggle_online.sql
-- Description: RPC for pickers to securely toggle their online status

CREATE OR REPLACE FUNCTION public.picker_toggle_online(p_is_online BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
    v_shift_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify role
    SELECT role INTO v_role
    FROM public.profiles WHERE id = auth.uid();
    
    IF v_role NOT IN ('picker', 'warehouse_staff') THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ROLE');
    END IF;

    -- If going ONLINE, verify active shift
    IF p_is_online = true THEN
        SELECT id
        INTO v_shift_id
        FROM public.staff_shifts 
        WHERE staff_id = auth.uid() 
          AND status = 'active' 
          AND shift_start <= NOW()
          AND shift_end >= NOW()
        LIMIT 1;

        IF v_shift_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_ACTIVE');
        END IF;
    END IF;

    -- Bypass the protective trigger
    PERFORM set_config('app.driver_status_update_allowed', 'true', true);

    UPDATE public.profiles 
    SET is_online = p_is_online 
    WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$$;
