-- 1. Drop the ambiguous 6-argument overload
DROP FUNCTION IF EXISTS public.write_admin_audit_log(TEXT, TEXT, TEXT, UUID, JSONB, JSONB);

-- 2. Drop the original 7-argument function (to recreate it with defaults)
DROP FUNCTION IF EXISTS public.write_admin_audit_log(TEXT, TEXT, TEXT, UUID, JSONB, JSONB, JSONB);

-- 3. Create ONE canonical function with defaults to safely handle all caller variations
CREATE OR REPLACE FUNCTION public.write_admin_audit_log(
    p_action_type TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_warehouse_id UUID DEFAULT NULL,
    p_before_state JSONB DEFAULT NULL,
    p_after_state JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Audit log failed: No authenticated user context.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Audit log failed: User is not an admin.';
    END IF;

    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, warehouse_id, before_state, after_state, metadata
    ) VALUES (
        v_admin_id, p_action_type, p_entity_type, p_entity_id, p_warehouse_id, p_before_state, p_after_state, p_metadata
    );
END;
$BODY$;
