-- Migration 90: Add operational duty tracking to staff_shifts

ALTER TABLE public.staff_shifts
ADD COLUMN current_duty TEXT,
ADD CONSTRAINT check_valid_duty CHECK (current_duty IN ('putaway', 'auditor', 'fnv', 'inward_receiver', 'damage_expiry'));

CREATE OR REPLACE FUNCTION public.warehouse_staff_set_duty(
    p_duty TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_target_shift_id UUID;
BEGIN
    -- 1. Validate Profile
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    -- 2. Validate Duty
    IF p_duty NOT IN ('putaway', 'auditor', 'fnv', 'inward_receiver', 'damage_expiry') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_DUTY');
    END IF;

    -- 3. Resolve active shift (Must be exactly 1)
    SELECT COUNT(*), MAX(id) INTO v_active_shifts_count, v_target_shift_id 
    FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shifts_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'SHIFT_NOT_ACTIVE');
    ELSIF v_active_shifts_count > 1 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_SHIFT_CONFLICT');
    END IF;

    -- 4. Audit Task Linkage
    -- Based on FlashGO's schema, `putaway_tasks` is unassigned until `completed`
    -- There are no other warehouse task tables that lock a worker into a duty currently.
    -- Thus, no blocking condition exists for switching duties safely.
    
    -- 5. Update Duty
    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = v_target_shift_id;

    RETURN jsonb_build_object('status', 'success', 'shift_id', v_target_shift_id, 'current_duty', p_duty);
END;
$$;
