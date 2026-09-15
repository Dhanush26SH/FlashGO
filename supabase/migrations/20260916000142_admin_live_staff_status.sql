-- ==============================================================================
-- Live Staff Status RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_live_staff_status(
    p_warehouse_id UUID,
    p_role public.user_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'worker_id', id,
            'worker_name', full_name,
            'employee_id', employee_id,
            'is_online', COALESCE(is_online, false)
        ) ORDER BY is_online DESC, full_name ASC
    )
    INTO v_result
    FROM public.profiles
    WHERE warehouse_id = p_warehouse_id
      AND role = p_role
      AND status = 'approved';

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
