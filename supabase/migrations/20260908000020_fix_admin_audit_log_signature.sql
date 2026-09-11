-- Add overloaded version of write_admin_audit_log for backward compatibility with 6-arg calls
CREATE OR REPLACE FUNCTION public.write_admin_audit_log(
    p_action_type TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_warehouse_id UUID,
    p_before_state JSONB,
    p_after_state JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
BEGIN
    PERFORM public.write_admin_audit_log(
        p_action_type,
        p_entity_type,
        p_entity_id,
        p_warehouse_id,
        p_before_state,
        p_after_state,
        NULL
    );
END;
$BODY$;
