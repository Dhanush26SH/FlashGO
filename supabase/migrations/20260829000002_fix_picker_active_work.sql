-- Phase 19.3: Fix Picker Active Work Guard

-- 1. Secure Warehouse Reassignment (Corrected)
CREATE OR REPLACE FUNCTION public.admin_update_staff_warehouse(
    p_target_id UUID,
    p_warehouse_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking'
    IF v_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Picker has active unfinished work';
        END IF;
    END IF;

    IF v_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Driver has active trips';
        END IF;
    END IF;

    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;
    RETURN TRUE;
END;
$$;

-- 2. Secure Role Reassignment (Corrected)
CREATE OR REPLACE FUNCTION public.admin_update_staff_role(
    p_target_id UUID,
    p_role public.user_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Cannot assign non-operational role via this workflow';
    END IF;

    SELECT role INTO v_old_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_old_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Check for active work that prevents role change
    IF v_old_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot change role: Driver has active trips';
        END IF;
    END IF;

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking'
    IF v_old_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking')) THEN
            RAISE EXCEPTION 'Cannot change role: Picker has active unfinished work';
        END IF;
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;
    RETURN TRUE;
END;
$$;
