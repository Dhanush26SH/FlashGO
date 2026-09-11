-- 20260831000009_protect_requested_role.sql

CREATE OR REPLACE FUNCTION protect_sensitive_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() = NEW.id THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Cannot modify role directly'; END IF;
        IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN RAISE EXCEPTION 'Cannot modify suspension status directly'; END IF;
        IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN RAISE EXCEPTION 'Cannot modify employee ID directly'; END IF;
        IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN RAISE EXCEPTION 'Cannot modify warehouse directly'; END IF;
        IF NEW.is_pending_staff IS DISTINCT FROM OLD.is_pending_staff THEN RAISE EXCEPTION 'Cannot modify pending staff status directly'; END IF;
        IF NEW.requested_role IS DISTINCT FROM OLD.requested_role THEN RAISE EXCEPTION 'Cannot modify requested_role directly'; END IF;
    END IF;

    -- Strict Wallet Protection
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance OR NEW.cod_wallet_liability IS DISTINCT FROM OLD.cod_wallet_liability THEN
        IF current_setting('flashgo.internal_mutation', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Cannot modify financial balances directly. Use authoritative RPCs.';
        END IF;
    END IF;

    -- Strict Vehicle Assignment Protection
    IF NEW.current_vehicle_id IS DISTINCT FROM OLD.current_vehicle_id THEN
        IF current_setting('flashgo.internal_vehicle_assignment', true) IS DISTINCT FROM 'true' THEN
            RAISE EXCEPTION 'Cannot modify vehicle assignment directly. Use assign_vehicle RPC.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;
