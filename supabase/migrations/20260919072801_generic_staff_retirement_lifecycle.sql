-- Migration: Generic Staff Retirement Lifecycle

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retired_reason TEXT;

CREATE OR REPLACE FUNCTION public.admin_retire_staff(p_target_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF auth.uid() = p_target_id THEN
        RAISE EXCEPTION 'Cannot retire yourself';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid operational staff member';
    END IF;

    -- 1. Picker / Orders
    IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'staged', 'handed_off')) THEN
        RAISE EXCEPTION 'Cannot retire: Worker has active unfinished orders';
    END IF;

    -- 2. Driver Trips
    IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
        RAISE EXCEPTION 'Cannot retire: Driver has active trips';
    END IF;

    -- 3. Shifts
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE staff_id = p_target_id AND status IN ('scheduled', 'booked', 'active', 'present')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has scheduled or active shifts';
    END IF;

    -- 4. Putaway Tasks
    IF EXISTS (SELECT 1 FROM public.putaway_tasks WHERE worker_id = p_target_id AND status IN ('pending', 'in_progress')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has active putaway tasks';
    END IF;

    -- 5. Cycle Counts
    IF EXISTS (SELECT 1 FROM public.cycle_counts WHERE counter_id = p_target_id AND status IN ('open', 'counting', 'submitted')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has active cycle counts';
    END IF;

    -- 6. COD Liability
    IF EXISTS (SELECT 1 FROM public.cod_collections WHERE driver_id = p_target_id AND status = 'pending') OR 
       (SELECT cod_wallet_liability FROM public.profiles WHERE id = p_target_id) > 0 THEN
        RAISE EXCEPTION 'Cannot retire: Driver has pending COD liability';
    END IF;

    -- 7. Driver Sessions
    IF EXISTS (SELECT 1 FROM public.driver_sessions WHERE driver_id = p_target_id AND status = 'delivering') THEN
        RAISE EXCEPTION 'Cannot retire: Driver has an active delivery session';
    END IF;

    -- Atomic State Cleanup
    UPDATE public.profiles
    SET 
        is_retired = true,
        is_online = false,
        warehouse_is_online = false,
        is_suspended = false,
        suspended_at = NULL,
        suspension_reason = NULL,
        retired_at = NOW(),
        retired_reason = p_reason
    WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_RETIRED', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('reason', p_reason), NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_staff(p_target_id uuid)
RETURNS boolean
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
        RAISE EXCEPTION 'Target is not a valid operational staff member';
    END IF;

    UPDATE public.profiles
    SET 
        is_retired = false,
        is_suspended = true, 
        suspension_reason = 'Pending re-onboarding review following restoration from retirement',
        suspended_at = NOW()
    WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_RESTORED_FROM_RETIREMENT', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('status', 'suspended_pending_review'), NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_active_shift_duty(p_shift_id uuid, p_duty text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_admin RECORD;
    v_shift RECORD;
    v_worker RECORD;
BEGIN
    -- 1. Validate caller is admin
    SELECT * INTO v_admin FROM public.profiles WHERE id = auth.uid();
    IF v_admin IS NULL OR v_admin.role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can assign shift duties';
    END IF;

    -- 2. Validate requested duty
    IF p_duty NOT IN ('putaway', 'auditor', 'inward_damage') THEN
        RAISE EXCEPTION 'Invalid duty specified: %', p_duty;
    END IF;

    -- 3. Lock the shift row FOR UPDATE to prevent concurrent assignments
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift % not found', p_shift_id;
    END IF;

    -- 4. Authoritative validations
    SELECT * INTO v_worker FROM public.profiles WHERE id = v_shift.staff_id;
    IF v_worker.is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    IF v_worker IS NULL OR v_worker.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Shift belongs to a worker who is not warehouse_staff';
    END IF;

    IF v_shift.warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Shift has no valid warehouse assignment';
    END IF;

    IF v_shift.status != 'active' THEN
        RAISE EXCEPTION 'Cannot assign duty: Shift is not active';
    END IF;

    IF v_shift.shift_end <= now() THEN
        RAISE EXCEPTION 'Cannot assign duty: Shift has expired';
    END IF;

    IF v_shift.current_duty IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot assign duty: Worker already has an active duty (%) that must be completed/released first', v_shift.current_duty;
    END IF;

    -- 5. Atomic Update
    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'shift_id', p_shift_id,
        'assigned_duty', p_duty
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_assign_picker(p_order_id uuid, p_picker_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    v_old_status TEXT;
    v_picker_retired BOOLEAN;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT is_retired INTO v_picker_retired FROM public.profiles WHERE id = p_picker_id;
    IF v_picker_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    SELECT status INTO v_old_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    UPDATE public.orders SET picker_id = p_picker_id, status = 'picking', updated_at = now() WHERE id = p_order_id;
    
    -- Hook: Notification to Picker
    PERFORM public.write_notification(
        p_picker_id, 'ORDER_ASSIGNED', 'New Picking Assignment',
        'You have been assigned to pick a new order.',
        'orders', p_order_id::text, 'assign_' || p_order_id::text,
        jsonb_build_object('route', '/staff/orders')
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_book_gigs(p_slot_ids uuid[])
 RETURNS TABLE(shift_id uuid, slot_id uuid, warehouse_id uuid, warehouse_name text, start_time timestamp with time zone, end_time timestamp with time zone, estimated_hourly_rate_min numeric, estimated_hourly_rate_max numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_slot RECORD;
    v_slot_id UUID;
    v_booked_count INT;
    v_warehouse_active BOOLEAN;
    v_new_shift_id UUID;
    v_processed_slots UUID[] := '{}';
    v_overlapping BOOLEAN;
BEGIN
    -- Enforce array is not empty
    IF array_length(p_slot_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No slots selected';
    END IF;

    -- Check driver
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN
        RAISE EXCEPTION 'Worker is not an active driver';
    END IF;

    -- Process unique slots in deterministic order to prevent deadlocks
    FOR v_slot_id IN (SELECT DISTINCT unnest(p_slot_ids) ORDER BY 1) LOOP
        
        -- 1. Lock and fetch slot
        SELECT * INTO v_slot FROM public.work_slots WHERE id = v_slot_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Slot % not found', v_slot_id;
        END IF;

        -- 2. Basic validations
        IF v_slot.status != 'published' THEN
            RAISE EXCEPTION 'Slot is not published';
        END IF;

        IF v_slot.start_time <= NOW() THEN
            RAISE EXCEPTION 'Cannot book a past slot';
        END IF;

        IF v_slot.target_role != 'driver' THEN
            RAISE EXCEPTION 'Slot is not for drivers';
        END IF;

        -- 3. Check active warehouse eligibility for drivers
        SELECT is_active INTO v_warehouse_active FROM public.warehouses WHERE id = v_slot.warehouse_id;
        IF v_warehouse_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Store is not active for booking';
        END IF;

        -- 4. Capacity
        SELECT COUNT(*) INTO v_booked_count 
        FROM public.staff_shifts 
        WHERE work_slot_id = v_slot_id AND status != 'cancelled';
        
        IF v_booked_count >= v_slot.capacity THEN
            RAISE EXCEPTION 'Slot is full';
        END IF;

        -- 5. Duplicate Check
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = auth.uid() 
            AND work_slot_id = v_slot_id 
            AND status != 'cancelled'
        ) THEN
            RAISE EXCEPTION 'Already booked this slot';
        END IF;

        -- 6. Overlap with existing shifts
        IF EXISTS (
            SELECT 1 FROM public.staff_shifts
            WHERE staff_id = auth.uid()
            AND status != 'cancelled'
            AND shift_start < v_slot.end_time
            AND shift_end > v_slot.start_time
        ) THEN
            RAISE EXCEPTION 'Conflicting shift exists for this time';
        END IF;

        -- 7. Overlap within the requested batch itself
        -- We check against other slots in p_slot_ids that are not v_slot_id
        SELECT EXISTS (
            SELECT 1 FROM public.work_slots ws2
            WHERE ws2.id = ANY(p_slot_ids)
            AND ws2.id != v_slot_id
            AND ws2.start_time < v_slot.end_time
            AND ws2.end_time > v_slot.start_time
        ) INTO v_overlapping;

        IF v_overlapping THEN
            RAISE EXCEPTION 'Selected slots overlap with each other';
        END IF;

        -- 8. Book
        INSERT INTO public.staff_shifts (staff_id, warehouse_id, shift_start, shift_end, status, work_slot_id)
        VALUES (auth.uid(), v_slot.warehouse_id, v_slot.start_time, v_slot.end_time, 'scheduled', v_slot_id)
        RETURNING id INTO v_new_shift_id;
        
        -- Store the result in a temporary array or temp table to return later
        -- Actually, since Postgres PL/pgSQL function returning TABLE can just do RETURN QUERY inside the loop.
        RETURN QUERY 
        SELECT 
            v_new_shift_id AS shift_id,
            v_slot_id AS slot_id,
            v_slot.warehouse_id AS warehouse_id,
            (SELECT name FROM public.warehouses WHERE id = v_slot.warehouse_id) AS warehouse_name,
            v_slot.start_time AS start_time,
            v_slot.end_time AS end_time,
            v_slot.estimated_hourly_rate_min AS estimated_hourly_rate_min,
            v_slot.estimated_hourly_rate_max AS estimated_hourly_rate_max;
            
    END LOOP;

    RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_cod_settlement(p_driver_id uuid, p_amount numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_liability DECIMAL;
    v_is_retired BOOLEAN;
BEGIN
    SELECT cod_wallet_liability, is_retired INTO v_liability, v_is_retired FROM public.profiles WHERE id = p_driver_id FOR UPDATE;

    IF v_is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;
    
    IF v_liability < p_amount THEN
        -- Prevent over-settlement, or adjust to max liability
        UPDATE public.profiles SET cod_wallet_liability = 0 WHERE id = p_driver_id;
    ELSE
        UPDATE public.profiles SET cod_wallet_liability = cod_wallet_liability - p_amount WHERE id = p_driver_id;
    END IF;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_shift_check_in(p_shift_id uuid, p_lat double precision, p_lng double precision, p_raw_qr_token text, p_selfie_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
    v_driver_role TEXT;
    v_driver_suspended BOOLEAN;
    v_driver_retired BOOLEAN;
    v_shift_staff_id UUID;
    v_shift_status TEXT;
    v_shift_wh UUID;
    v_shift_start TIMESTAMPTZ;
    v_shift_end TIMESTAMPTZ;
    v_wh_lat FLOAT;
    v_wh_lng FLOAT;
    v_distance FLOAT;
    v_qr_id UUID;
    v_selfie_created_at TIMESTAMPTZ;
    v_result JSONB;
    v_late_minutes INTEGER;
    v_is_late BOOLEAN := false;
    v_penalty_text TEXT;
    v_penalty_amount NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify driver
    SELECT role, is_suspended, is_retired INTO v_driver_role, v_driver_suspended, v_driver_retired
    FROM public.profiles WHERE id = auth.uid();

    IF v_driver_retired = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_RETIRED');
    END IF;
    
    IF v_driver_role != 'driver' OR v_driver_suspended = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    -- Shift Lock and Verify
    SELECT staff_id, status, warehouse_id, shift_start, shift_end
    INTO v_shift_staff_id, v_shift_status, v_shift_wh, v_shift_start, v_shift_end
    FROM public.staff_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_FOUND');
    END IF;

    IF v_shift_staff_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_OWNED');
    END IF;

    IF v_shift_status != 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_SCHEDULED');
    END IF;

    -- Check for duplicate success
    IF EXISTS (
        SELECT 1 FROM public.driver_check_in_records
        WHERE driver_id = auth.uid() AND staff_shift_id = p_shift_id AND status = 'SUCCESS'
    ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CHECKED_IN');
    END IF;

    -- Time Eligibility (Early Window is 30 mins before shift)
    IF NOW() < (v_shift_start - interval '30 minutes') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'TOO_EARLY');
        RETURN jsonb_build_object('success', false, 'code', 'TOO_EARLY');
    END IF;

    -- Late minutes calculation (Database Time)
    IF NOW() > v_shift_start THEN
        v_late_minutes := CEIL(EXTRACT(EPOCH FROM (NOW() - v_shift_start)) / 60.0);
    ELSE
        v_late_minutes := 0;
    END IF;

    -- Expired Window (Gig ended)
    IF NOW() >= v_shift_end THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'CHECK_IN_WINDOW_EXPIRED');
        RETURN jsonb_build_object('success', false, 'code', 'CHECK_IN_WINDOW_EXPIRED');
    END IF;

    -- Is Late? (5-minute grace period)
    IF NOW() > v_shift_start + interval '5 minutes' THEN
        v_is_late := true;
    END IF;

    -- Geofence Validation
    SELECT lat, lng INTO v_wh_lat, v_wh_lng
    FROM public.warehouses WHERE id = v_shift_wh;

    IF v_wh_lat IS NULL OR v_wh_lng IS NULL OR p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, p_selfie_path, 'FAILED', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_LOCATION_NOT_CONFIGURED');
    END IF;

    v_distance := public.calculate_haversine_distance(p_lat, p_lng, v_wh_lat, v_wh_lng);

    IF v_distance > 200 THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, 'FAILED', 'OUTSIDE_WAREHOUSE_GEOFENCE');
        RETURN jsonb_build_object('success', false, 'code', 'OUTSIDE_WAREHOUSE_GEOFENCE');
    END IF;

    -- QR Validation
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift_wh AND raw_token = p_raw_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, 'FAILED', 'INVALID_QR_TOKEN');
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    -- Selfie Evidence Freshness
    SELECT created_at INTO v_selfie_created_at
    FROM storage.objects
    WHERE bucket_id = 'driver_check_ins' AND name = p_selfie_path;

    IF v_selfie_created_at IS NULL OR v_selfie_created_at < (NOW() - interval '5 minutes') OR p_selfie_path NOT LIKE (auth.uid() || '/' || p_shift_id || '/%') THEN
        INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, qr_challenge_id, status, failure_reason)
        VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, v_qr_id, 'FAILED', 'INVALID_SELFIE_EVIDENCE');
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_SELFIE_EVIDENCE');
    END IF;

    -- Atomic Success Transitions
    UPDATE public.staff_shifts SET status = 'active' WHERE id = p_shift_id;
    
    INSERT INTO public.driver_sessions (driver_id, status, latest_lat, latest_lng, staff_shift_id, updated_at)
    VALUES (auth.uid(), 'active', p_lat, p_lng, p_shift_id, NOW())
    ON CONFLICT (driver_id) WHERE status = 'active'
    DO UPDATE SET staff_shift_id = p_shift_id, latest_lat = p_lat, latest_lng = p_lng, updated_at = NOW();

    INSERT INTO public.driver_check_in_records (driver_id, staff_shift_id, warehouse_id, submitted_lat, submitted_lng, calculated_distance_meters, selfie_storage_path, qr_challenge_id, status, is_late, late_by_minutes)
    VALUES (auth.uid(), p_shift_id, v_shift_wh, p_lat, p_lng, v_distance, p_selfie_path, v_qr_id, 'SUCCESS', v_is_late, v_late_minutes);

    -- Apply Penalty if Late
    IF v_is_late THEN
        BEGIN
            SELECT value INTO v_penalty_text FROM public.app_settings WHERE key = 'late_check_in_penalty_amount';
            IF v_penalty_text IS NOT NULL THEN
                v_penalty_amount := v_penalty_text::NUMERIC;
            ELSE
                v_penalty_amount := 0;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Sane fallback to 0 penalty, do not break the physical check-in because of a bad config string
            v_penalty_amount := 0;
        END;

        -- Ensure it's never negative (which would become positive earnings below)
        IF v_penalty_amount > 0 THEN
            INSERT INTO public.driver_financial_ledger (
                driver_id, amount, transaction_type, source_reference_id, description, created_by
            ) VALUES (
                auth.uid(), -v_penalty_amount, 'penalty', p_shift_id, 'LATE_GIG_CHECK_IN', NULL
            ) ON CONFLICT (source_reference_id) WHERE transaction_type = 'penalty' AND description = 'LATE_GIG_CHECK_IN' DO NOTHING;
        END IF;
    END IF;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$function$;

CREATE OR REPLACE FUNCTION public.driver_toggle_break_status(p_is_online boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_session_id UUID;
    v_shift_id UUID;
    v_shift_status TEXT;
    v_shift_end TIMESTAMPTZ;
    v_shift_wh UUID; -- NEW: track warehouse
    v_driver_role TEXT;
    v_driver_suspended BOOLEAN;
    v_driver_retired BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify driver
    SELECT role, is_suspended, is_retired INTO v_driver_role, v_driver_suspended, v_driver_retired
    FROM public.profiles WHERE id = auth.uid();

    IF v_driver_retired = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_RETIRED');
    END IF;
    
    IF v_driver_role != 'driver' OR v_driver_suspended = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    IF p_is_online = false THEN
        -- Check for active deliveries
        IF EXISTS (
            SELECT 1 FROM public.logistics_trips 
            WHERE driver_id = auth.uid() AND status IN ('accepted', 'in_transit')
        ) THEN
            RETURN jsonb_build_object('success', false, 'code', 'ACTIVE_DELIVERY_IN_PROGRESS');
        END IF;
    ELSE
        -- Resume Online validation
        SELECT id, staff_shift_id INTO v_session_id, v_shift_id
        FROM public.driver_sessions 
        WHERE driver_id = auth.uid() AND status = 'active';

        IF v_session_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
        END IF;

        -- MODIFIED: added warehouse_id
        SELECT status, shift_end, warehouse_id INTO v_shift_status, v_shift_end, v_shift_wh
        FROM public.staff_shifts WHERE id = v_shift_id;

        IF v_shift_status != 'active' THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_ACTIVE');
        END IF;

        IF NOW() >= v_shift_end THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_EXPIRED');
        END IF;
    END IF;

    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = p_is_online WHERE id = auth.uid();

    -- NEW: Trigger dispatch if driver came online
    IF p_is_online = true THEN
        PERFORM public.run_dispatch_cycle(v_shift_wh);
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'SUCCESS');
END;
$function$;

CREATE OR REPLACE FUNCTION public.picker_shift_check_in(p_shift_id uuid, p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
    v_existing_token TEXT;
    v_rate NUMERIC(10,2);
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    IF v_profile.role NOT IN ('picker', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Worker role not permitted to start picker shifts';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    IF v_shift.status = 'cancelled' OR v_shift.status = 'completed' THEN
        RAISE EXCEPTION 'Shift cannot be started in state: %', v_shift.status;
    END IF;

    -- Retrieve the associated work_slot for time validation
    SELECT * INTO v_slot FROM public.work_slots WHERE id = v_shift.work_slot_id;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Associated work slot not found';
    END IF;

    -- 3. Verify QR Token
    -- Check that the QR token belongs to the shift's warehouse and is not expired
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift.warehouse_id
      AND raw_token = p_qr_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NULL THEN
        RAISE EXCEPTION 'This QR does not belong to your booked store or is expired.';
    END IF;

    -- 4. Time Validation
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Activate Shift (Idempotent)
    IF v_shift.status != 'active' THEN
        v_rate := COALESCE(v_shift.picker_rate_snapshot, v_slot.picker_pay_rate);
        
        -- INVARIANT: Picker rate must be > 0 at shift start
        IF v_rate IS NULL OR v_rate <= 0 THEN
            RAISE EXCEPTION 'Cannot start shift: Work Slot has no valid picker pay rate configured (%). Please contact Admin.', v_rate;
        END IF;

        UPDATE public.staff_shifts
        SET 
            status = 'active', 
            started_at = COALESCE(v_shift.started_at, now()),
            picker_rate_snapshot = v_rate
        WHERE id = p_shift_id;

        -- Idempotent snapshot of milestones (only targets > 0 and rewards >= 0 are saved by Admin UI)
        INSERT INTO public.picker_shift_incentive_milestones (shift_id, target_items, reward_amount, sort_order)
        SELECT p_shift_id, target_items, reward_amount, sort_order
        FROM public.work_slot_picker_incentives
        WHERE work_slot_id = v_slot.id
        ON CONFLICT (shift_id, target_items) DO NOTHING;
    END IF;

    -- 6. Set online status atomically (restored)
    -- Using the protected server-side mechanism
    PERFORM set_config('app.driver_status_update_allowed', 'true', true);
    UPDATE public.profiles SET is_online = true WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.picker_toggle_online(p_is_online boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_role TEXT;
    v_is_retired BOOLEAN;
    v_shift_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Verify role
    SELECT role, is_retired INTO v_role, v_is_retired
    FROM public.profiles WHERE id = auth.uid();

    IF v_is_retired = true THEN
        RETURN jsonb_build_object('success', false, 'code', 'WORKER_RETIRED');
    END IF;
    
    IF v_role NOT IN ('picker', 'warehouse_staff') THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED_ROLE');
    END IF;

    -- If going ONLINE, verify active shift
    IF p_is_online = true THEN
        SELECT id
        INTO v_shift_id
        FROM public.staff_shifts 
        WHERE staff_id = auth.uid() 
          AND status = 'active' 
          AND shift_start <= NOW()
          AND shift_end >= NOW()
        LIMIT 1;

        IF v_shift_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'SHIFT_NOT_ACTIVE');
        END IF;
    END IF;

    -- Bypass the protective trigger
    PERFORM set_config('app.driver_status_update_allowed', 'true', true);

    UPDATE public.profiles 
    SET is_online = p_is_online 
    WHERE id = auth.uid();

    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_raw_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_is_retired BOOLEAN;
    v_active_shift public.staff_shifts;
    v_token_hash TEXT;
    v_challenge public.return_handover_challenges;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Verify Staff Authorization
    SELECT role, COALESCE(is_retired, false) INTO v_staff_role, v_is_retired FROM public.profiles WHERE id = v_staff_id;
    IF v_is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;
    IF v_staff_role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Unauthorized: Must be warehouse_staff';
    END IF;

    -- Must have an active shift
    SELECT * INTO v_active_shift
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: No active staff shift';
    END IF;

    -- Hash the incoming token (SCHEMA QUALIFIED)
    v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');

    -- Find and lock the challenge (atomic check-and-consume)
    SELECT * INTO v_challenge
    FROM public.return_handover_challenges
    WHERE token_hash = v_token_hash 
      AND expires_at > now() 
      AND consumed_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or consumed QR challenge';
    END IF;

    -- Find the task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE id = v_challenge.driver_return_task_id AND status = 'required';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return task is no longer required';
    END IF;

    -- ENFORCE MERCHANDISE RETURN ONLY
    IF v_task.return_type != 'merchandise' THEN
        RAISE EXCEPTION 'NOT_MERCHANDISE_RETURN';
    END IF;

    -- ENFORCE DURABLE ORDER IDENTITY
    IF v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Merchandise return task is missing order_id';
    END IF;

    -- Ensure staff shift warehouse matches task warehouse
    IF v_active_shift.warehouse_id != v_task.warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff is at a different warehouse than the return task';
    END IF;

    -- Mark challenge consumed
    UPDATE public.return_handover_challenges 
    SET consumed_at = now() 
    WHERE id = v_challenge.id;

    -- Insert the intake session
    INSERT INTO public.return_intakes (
        driver_return_task_id, trip_id, driver_id, warehouse_id, received_by_staff_id, status
    )
    VALUES (
        v_task.id, v_task.trip_id, v_task.driver_id, v_task.warehouse_id, v_staff_id, 'scanning'
    )
    RETURNING id INTO v_intake_id;

    -- Populate expected return items directly from the exact order items
    INSERT INTO public.return_intake_items (
        return_intake_id, order_id, product_id, expected_quantity, received_quantity
    )
    SELECT 
        v_intake_id,
        v_task.order_id,
        oi.product_id,
        oi.quantity,
        0
    FROM public.order_items oi
    WHERE oi.order_id = v_task.order_id;

    RETURN v_intake_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_start_return_intake(p_driver_id uuid, p_return_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_staff_id UUID;
    v_warehouse_id UUID;
    v_is_retired BOOLEAN;
    v_task public.driver_return_tasks;
    v_intake_id UUID;
BEGIN
    v_staff_id := auth.uid();

    -- Check staff authorization
    SELECT is_retired INTO v_is_retired FROM public.profiles WHERE id = v_staff_id;
    IF v_is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    SELECT warehouse_id INTO v_warehouse_id
    FROM public.staff_shifts
    WHERE staff_id = v_staff_id AND status = 'active'
    ORDER BY started_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Active shift required';
    END IF;

    -- Find the pending return task
    SELECT * INTO v_task
    FROM public.driver_return_tasks
    WHERE driver_id = p_driver_id
      AND return_type = p_return_type
      AND status = 'pending'
      AND warehouse_id = v_warehouse_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending return task of type % found for this driver at this warehouse', p_return_type;
    END IF;

    -- If merchandise, require order_id
    IF v_task.return_type = 'merchandise' AND v_task.order_id IS NULL THEN
        RAISE EXCEPTION 'Merchandise return task is missing order_id';
    END IF;

    -- Verify no active intake
    IF EXISTS (
        SELECT 1 FROM public.return_intakes 
        WHERE driver_return_task_id = v_task.id AND status = 'scanning'
    ) THEN
        RAISE EXCEPTION 'An active intake already exists for this return task';
    END IF;

    -- Create intake
    INSERT INTO public.return_intakes (driver_return_task_id, warehouse_id, received_by_staff_id, status)
    VALUES (v_task.id, v_warehouse_id, v_staff_id, 'scanning')
    RETURNING id INTO v_intake_id;

    -- For merchandise, derive expected items from task.order_id -> order_items
    IF v_task.return_type = 'merchandise' THEN
        INSERT INTO public.return_intake_items (
            return_intake_id, order_id, product_id, expected_quantity, received_quantity
        )
        SELECT 
            v_intake_id,
            v_task.order_id,
            oi.product_id,
            oi.quantity,
            0
        FROM public.order_items oi
        WHERE oi.order_id = v_task.order_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'intake_id', v_intake_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_picking(p_order_id uuid, p_picker_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_is_suspended BOOLEAN;
    v_is_retired BOOLEAN;
    v_picker_warehouse_id UUID;
BEGIN
    -- Validate profile and role
    SELECT warehouse_id, COALESCE(is_suspended, FALSE), COALESCE(is_retired, FALSE) INTO v_picker_warehouse_id, v_is_suspended, v_is_retired 
    FROM public.profiles 
    WHERE id = p_picker_id AND role IN ('picker', 'admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: User is not a valid picker/admin';
    END IF;

    IF v_is_retired = TRUE THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account is suspended.';
    END IF;

    -- Lock and get order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Check assignment (admin bypass allowed for flexibility)
    IF v_order.picker_id != p_picker_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Order is not assigned to this picker';
    END IF;

    -- Idempotency
    IF v_order.status = 'picking' THEN
        RETURN;
    END IF;

    -- Validate state transition
    IF v_order.status != 'placed' THEN
        RAISE EXCEPTION 'Cannot start picking for order in status: %', v_order.status;
    END IF;

    -- Validate warehouse match (allow admin to bypass if needed, but normally strict)
    IF v_order.warehouse_id != v_picker_warehouse_id AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_picker_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Warehouse mismatch between picker and order';
    END IF;

    -- Transition state
    UPDATE public.orders SET status = 'picking', updated_at = now() WHERE id = p_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.warehouse_staff_set_duty(p_duty text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_target_shift_id UUID;
    v_current_duty TEXT;
    v_in_progress_count INT;
BEGIN
    -- 1. Validate Profile
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF v_profile.is_retired = true THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'WORKER_RETIRED');
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'UNAUTHORIZED_OR_SUSPENDED');
    END IF;

    -- 2. Validate Duty (legacy + new)
    IF p_duty NOT IN ('putaway', 'auditor', 'inward_damage', 'fnv', 'inward_receiver', 'damage_expiry') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_DUTY');
    END IF;

    -- 3. Resolve active shift
    SELECT COUNT(*) INTO v_active_shifts_count
    FROM public.staff_shifts 
    WHERE staff_id = auth.uid() AND status = 'active';

    IF v_active_shifts_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'SHIFT_NOT_ACTIVE');
    ELSIF v_active_shifts_count > 1 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_SHIFT_CONFLICT');
    END IF;

    -- Retrieve the active shift UUID and current duty
    SELECT id, current_duty INTO v_target_shift_id, v_current_duty
    FROM public.staff_shifts
    WHERE staff_id = auth.uid() AND status = 'active';

    -- NEW: Block duty change if shift already has an assigned duty
    IF v_current_duty IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'DUTY_ALREADY_ASSIGNED_BY_ADMIN');
    END IF;

    -- Block duty change if there's an in_progress putaway task
    SELECT COUNT(*) INTO v_in_progress_count
    FROM public.putaway_tasks
    WHERE worker_id = auth.uid() AND status = 'in_progress';

    IF v_in_progress_count > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'ACTIVE_PUTAWAY_TASK');
    END IF;

    -- Update Duty
    UPDATE public.staff_shifts
    SET current_duty = p_duty
    WHERE id = v_target_shift_id
      AND staff_id = auth.uid()
      AND status = 'active';

    RETURN jsonb_build_object('status', 'success', 'shift_id', v_target_shift_id, 'current_duty', p_duty);
END;
$function$;

CREATE OR REPLACE FUNCTION public.warehouse_staff_shift_check_in(p_shift_id uuid, p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift RECORD;
    v_profile RECORD;
    v_slot RECORD;
    v_existing_token TEXT;
BEGIN
    -- 1. Get profile and verify it's the current user
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.is_retired = true THEN
        RAISE EXCEPTION 'Worker is retired';
    END IF;

    IF v_profile IS NULL OR v_profile.is_suspended = true THEN
        RAISE EXCEPTION 'Worker is inactive or suspended';
    END IF;

    -- STRICT ROLE CHECK: Only warehouse_staff allowed.
    IF v_profile.role != 'warehouse_staff' THEN
        RAISE EXCEPTION 'Worker role not permitted to start warehouse staff shifts';
    END IF;

    -- 2. Lock and retrieve the shift
    SELECT * INTO v_shift FROM public.staff_shifts WHERE id = p_shift_id FOR UPDATE;
    IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Shift not found';
    END IF;

    -- Ownership check
    IF v_shift.staff_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Shift does not belong to you';
    END IF;

    -- Status check
    IF v_shift.status = 'cancelled' OR v_shift.status = 'completed' THEN
        RAISE EXCEPTION 'Shift cannot be started in state: %', v_shift.status;
    END IF;

    -- Retrieve the associated work_slot for generic time validation
    SELECT * INTO v_slot FROM public.work_slots WHERE id = v_shift.work_slot_id;
    IF v_slot IS NULL THEN
        RAISE EXCEPTION 'Associated work slot not found';
    END IF;

    -- 3. Verify QR Token
    -- Check that the QR token belongs to the shift's warehouse and is not expired
    SELECT raw_token INTO v_existing_token
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_shift.warehouse_id
      AND raw_token = p_qr_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_token IS NULL THEN
        RAISE EXCEPTION 'This QR does not belong to your booked store or is expired.';
    END IF;

    -- 4. Time Validation (Generic staff rules: 5 min early allowed)
    IF now() < (v_slot.start_time - interval '5 minutes') THEN
        RAISE EXCEPTION 'Shift cannot be started yet. Available 5 minutes before scheduled start.';
    END IF;

    IF now() >= v_slot.end_time THEN
        RAISE EXCEPTION 'Shift has already ended.';
    END IF;

    -- 5. Activate Shift (Idempotent)
    IF v_shift.status != 'active' THEN
        UPDATE public.staff_shifts
        SET 
            status = 'active', 
            started_at = COALESCE(v_shift.started_at, now())
        WHERE id = p_shift_id;
    END IF;

    -- 6. Make worker ONLINE
    -- This enforces immediate visibility and readiness upon physical check-in.
    UPDATE public.profiles
    SET warehouse_is_online = true
    WHERE id = auth.uid();
    
    RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.warehouse_staff_toggle_online(p_is_online boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_profile RECORD;
    v_active_shifts_count INT;
    v_in_progress_count INT;
BEGIN
    SELECT * INTO v_profile FROM public.profiles 
    WHERE id = auth.uid() AND role = 'warehouse_staff' AND is_suspended = FALSE;

    IF v_profile.is_retired = true THEN
        RAISE EXCEPTION 'WORKER_RETIRED';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_SUSPENDED';
    END IF;

    IF p_is_online = true THEN
        SELECT COUNT(*) INTO v_active_shifts_count
        FROM public.staff_shifts 
        WHERE staff_id = auth.uid() AND status = 'active';

        IF v_active_shifts_count = 0 THEN
            RAISE EXCEPTION 'SHIFT_NOT_ACTIVE';
        END IF;
    ELSE
        -- Going offline. Check for in_progress putaway task
        SELECT COUNT(*) INTO v_in_progress_count
        FROM public.putaway_tasks
        WHERE worker_id = auth.uid() AND status = 'in_progress';

        IF v_in_progress_count > 0 THEN
            RAISE EXCEPTION 'ACTIVE_PUTAWAY_TASK';
        END IF;
    END IF;

    UPDATE public.profiles
    SET warehouse_is_online = p_is_online
    WHERE id = auth.uid();

    RETURN jsonb_build_object('status', 'success', 'is_online', p_is_online);
END;
$function$;

