-- Migration: 20260916000008_fix_warehouse_qr_lock_key.sql
-- Description: Fix "4 is not a valid binary digit" error in get_or_create_current_warehouse_qr by using hashtext for deterministic advisory lock key.

CREATE OR REPLACE FUNCTION public.get_or_create_current_warehouse_qr(p_warehouse_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role TEXT;
    v_admin_wh UUID;
    v_existing_token TEXT;
    v_new_token TEXT;
    v_lock_key INT;
BEGIN
    -- Validate auth.uid()
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, warehouse_id INTO v_admin_role, v_admin_wh
    FROM public.profiles WHERE id = auth.uid();

    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Access denied: not an admin';
    END IF;

    IF v_admin_wh IS NOT NULL AND v_admin_wh != p_warehouse_id THEN
        RAISE EXCEPTION 'Access denied: unauthorized warehouse';
    END IF;

    -- Concurrency Protection: Advisory lock keyed by warehouse_id
    -- Fixed: Use standard postgres hashtext instead of invalid bit cast on md5 string
    v_lock_key := hashtext(p_warehouse_id::text);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Check for valid existing challenge (>5 seconds remaining)
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = p_warehouse_id
      AND expires_at > (NOW() + interval '5 seconds')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NOT NULL THEN
        RETURN v_existing_token;
    END IF;

    -- Generate new token using gen_random_uuid to avoid pgcrypto dependency issues
    v_new_token := replace(gen_random_uuid()::text, '-', '');
    
    INSERT INTO public.warehouse_qr_challenges (warehouse_id, raw_token, expires_at)
    VALUES (p_warehouse_id, v_new_token, NOW() + interval '60 seconds');

    RETURN v_new_token;
END;
$$;
