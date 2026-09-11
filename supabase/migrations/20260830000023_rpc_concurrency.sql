-- Migration: 20260830000023_rpc_concurrency.sql

CREATE OR REPLACE FUNCTION public.test_concurrent_book(p_slot_id UUID, p_picker_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_picker_id UUID;
BEGIN
    SELECT id INTO v_picker_id FROM auth.users WHERE email = p_picker_email LIMIT 1;
    IF v_picker_id IS NULL THEN
        RAISE EXCEPTION 'Picker not found';
    END IF;

    -- Impersonate the picker
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_picker_id), true);

    -- Call the booking function
    RETURN public.worker_book_slot(p_slot_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_concurrent_book TO anon;
