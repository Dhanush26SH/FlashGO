-- Migration: 20260916000088_warehouse_staff_availability.sql
-- Description: Creates isolated availability state for Warehouse Staff, plus reconciliation logic.

-- 1. Add isolated online state to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS warehouse_is_online BOOLEAN NOT NULL DEFAULT false;

-- 2. Toggle RPC for warehouse staff availability
CREATE OR REPLACE FUNCTION public.warehouse_staff_toggle_online(
    p_is_online BOOLEAN
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
BEGIN
    -- Get current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    
    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    -- Strict Role Check
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Worker role not permitted for warehouse availability';
    END IF;

    -- If going online, enforce conditions
    IF p_is_online = true THEN
        IF v_profile.warehouse_id IS NULL THEN
            RAISE EXCEPTION 'Warehouse staff must be assigned to a warehouse to go online';
        END IF;

        -- Must have an active shift
        SELECT * INTO v_active_shift FROM public.staff_shifts 
        WHERE staff_id = auth.uid() AND status = 'active'
        LIMIT 1;

        IF v_active_shift IS NULL THEN
            RAISE EXCEPTION 'Cannot go online without an active shift';
        END IF;
    END IF;

    -- Update isolated state only
    UPDATE public.profiles 
    SET warehouse_is_online = p_is_online 
    WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'warehouse_is_online', p_is_online);
END;
$$;

-- 3. Reconcile RPC
CREATE OR REPLACE FUNCTION public.warehouse_staff_reconcile_shift() 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shift RECORD;
    v_slot RECORD;
    v_expired BOOLEAN := false;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    
    IF v_profile IS NULL OR v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Find current active shift
    SELECT * INTO v_active_shift FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active'
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    -- If there's an active shift, check if it's expired
    IF v_active_shift IS NOT NULL THEN
        SELECT * INTO v_slot FROM public.work_slots WHERE id = v_active_shift.work_slot_id;
        
        -- If current time is past the slot's end time, it has expired
        IF v_slot IS NOT NULL AND now() >= v_slot.end_time THEN
            v_expired := true;
            
            -- Transition shift to completed (existing terminal state)
            UPDATE public.staff_shifts 
            SET status = 'completed', updated_at = now()
            WHERE id = v_active_shift.id;

            -- Force offline
            UPDATE public.profiles
            SET warehouse_is_online = false
            WHERE id = auth.uid();
            
            RETURN jsonb_build_object('status', 'expired', 'shift_id', v_active_shift.id);
        END IF;
        
        RETURN jsonb_build_object('status', 'active', 'shift_id', v_active_shift.id);
    END IF;

    -- If no active shift, ensure they are offline
    IF v_profile.warehouse_is_online = true THEN
        UPDATE public.profiles
        SET warehouse_is_online = false
        WHERE id = auth.uid();
    END IF;

    RETURN jsonb_build_object('status', 'no_active_shift');
END;
$$;

-- 4. Defensive Trigger on staff_shifts
-- Forces warehouse_is_online to false if shift status changes from 'active' to anything else
CREATE OR REPLACE FUNCTION public.trg_warehouse_shift_ended()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- If status changes from active to completed/cancelled
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
        UPDATE public.profiles 
        SET warehouse_is_online = false 
        WHERE id = NEW.staff_id AND role = 'warehouse_staff';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_warehouse_shift_ended ON public.staff_shifts;
CREATE TRIGGER trigger_warehouse_shift_ended
    AFTER UPDATE OF status ON public.staff_shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_warehouse_shift_ended();
