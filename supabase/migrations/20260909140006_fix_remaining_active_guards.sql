-- Migration 20260909140006_fix_remaining_active_guards.sql

-- 1. Fix trigger_auto_assign_picker
CREATE OR REPLACE FUNCTION public.trigger_auto_assign_picker()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_picker_id UUID;
BEGIN
    -- Only assign if placed and no picker
    IF NEW.status = 'placed' AND NEW.picker_id IS NULL THEN
        -- Priority 1: Dedicated Picker (role='picker', online, not suspended, zero active picking tasks, eligible shift)
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'picker' 
          AND p.warehouse_id = NEW.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND public.is_worker_eligible_for_assignment(p.id) = true
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            RETURN NEW;
        END IF;

        -- Priority 2: Warehouse Staff Fallback (unchanged, shift logic not applied)
        SELECT p.id INTO v_picker_id
        FROM public.profiles p
        WHERE p.role = 'warehouse_staff' 
          AND p.warehouse_id = NEW.warehouse_id
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.orders o 
              WHERE o.picker_id = p.id AND o.status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')
          )
        ORDER BY p.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_picker_id IS NOT NULL THEN
            NEW.picker_id := v_picker_id;
            RETURN NEW;
        END IF;

        -- Priority 3: Unassigned (Leave as NULL)
    END IF;
    RETURN NEW;
END;
$function$;

-- 2. Fix admin_update_staff_warehouse
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

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking' through 'staged'
    IF v_role IN ('picker', 'warehouse_staff') THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Worker has active unfinished work';
        END IF;
    END IF;

    IF v_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Driver has active trips';
        END IF;
    END IF;

    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_WAREHOUSE_CHANGED', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('warehouse_id', p_warehouse_id), NULL
    );

    RETURN TRUE;
END;
$$;

-- 3. Fix admin_update_staff_role
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

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking' through 'staged'
    IF v_old_role IN ('picker', 'warehouse_staff') THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')) THEN
            RAISE EXCEPTION 'Cannot change role: Worker has active unfinished work';
        END IF;
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_ROLE_CHANGED', 'profiles', p_target_id::text, NULL,
        jsonb_build_object('role', v_old_role), jsonb_build_object('role', p_role), NULL
    );

    RETURN TRUE;
END;
$$;

-- 4. Fix admin_suspend_user
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
    p_target_id UUID,
    p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_is_suspended BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role, is_suspended INTO v_role, v_is_suspended FROM public.profiles WHERE id = p_target_id FOR UPDATE;

    IF v_is_suspended THEN
        RAISE EXCEPTION 'User is already suspended';
    END IF;

    -- Enforce active-work guards before suspension
    IF v_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot suspend user: Driver has active trips in progress';
        END IF;
    END IF;

    IF v_role IN ('picker', 'warehouse_staff') THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'packed', 'staged')) THEN
            RAISE EXCEPTION 'Cannot suspend user: Worker has active unfinished work';
        END IF;
    END IF;

    UPDATE public.profiles SET is_suspended = true, suspended_at = now() WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'USER_SUSPENDED', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('reason', p_reason), NULL
    );

    RETURN TRUE;
END;
$$;
