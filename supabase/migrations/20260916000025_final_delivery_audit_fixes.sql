-- Migration: 20260916000025_final_delivery_audit_fixes.sql
-- Description: Implement final human audit corrections
-- 1. Use calculate_haversine_distance returning meters (existing fn).
-- 2. Add completion_acknowledged_at, in_transit_at timestamps.
-- 3. Create server-authoritative route distance (fallback: haversine * 1.4 for now).
-- 4. Send Customer OTP notification.
-- 5. Do not drop return tasks on shift expiry.

-- ==========================================================
-- 2. Timestamps and Completion Acknowledgement
-- ==========================================================
ALTER TABLE public.logistics_trips
ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completion_acknowledged_at TIMESTAMPTZ;

-- Drop the buggy shift expiry trigger that deleted return obligations
DROP TRIGGER IF EXISTS trigger_shift_expiry_returns ON public.staff_shifts;
DROP FUNCTION IF EXISTS public.handle_shift_expiry_returns();

-- Update dispatch logic to respect unacknowledged completion
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip RECORD;
    v_driver_id UUID;
    v_attempt_count INT;
BEGIN
    UPDATE public.driver_trip_offers dto
    SET status = 'expired', responded_at = NOW()
    FROM public.logistics_trips lt
    WHERE dto.trip_id = lt.id
      AND dto.status = 'offered'
      AND dto.expires_at <= NOW()
      AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id);

    FOR v_trip IN
        SELECT lt.id, lt.warehouse_id
        FROM public.logistics_trips lt
        LEFT JOIN public.driver_trip_offers active_dto
            ON active_dto.trip_id = lt.id AND active_dto.status = 'offered'
        WHERE lt.status = 'pending'
          AND lt.driver_id IS NULL
          AND active_dto.id IS NULL
          AND (p_warehouse_id IS NULL OR lt.warehouse_id = p_warehouse_id)
        FOR UPDATE OF lt SKIP LOCKED
    LOOP
        SELECT COUNT(*) INTO v_attempt_count FROM public.driver_trip_offers WHERE trip_id = v_trip.id;

        IF v_attempt_count >= 3 THEN
            UPDATE public.logistics_trips SET status = 'dispatch_failed', updated_at = NOW() WHERE id = v_trip.id;
            CONTINUE;
        END IF;

        SELECT p.id INTO v_driver_id
        FROM public.profiles p
        JOIN public.driver_sessions ds ON ds.driver_id = p.id AND ds.status = 'active'
        JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
            AND ss.status = 'active'
            AND ss.warehouse_id = v_trip.warehouse_id
            AND ss.shift_end > NOW()
        WHERE p.role = 'driver'
          AND p.is_online = true
          AND COALESCE(p.is_suspended, false) = false
          AND NOT EXISTS (
              SELECT 1 FROM public.logistics_trips busy
              WHERE busy.driver_id = p.id 
              AND (
                busy.status IN ('accepted', 'in_transit')
                OR (busy.status = 'completed' AND busy.completion_acknowledged_at IS NULL)
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers prev
              WHERE prev.trip_id = v_trip.id AND prev.driver_id = p.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_return_tasks drt
              WHERE drt.driver_id = p.id AND drt.status = 'required'
          )
        ORDER BY
            (SELECT MAX(lt2.updated_at)
             FROM public.logistics_trips lt2
             WHERE lt2.driver_id = p.id AND lt2.status IN ('completed', 'cancelled')
            ) ASC NULLS FIRST,
            ds.created_at ASC
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, NOW() + INTERVAL '60 seconds');
        END IF;
    END LOOP;
END;
$$;


-- ==========================================================
-- 3. Arrival and Completion (Refactored for Timestamps & OSRM bypass fallback)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.driver_mark_arrived(p_trip_id UUID, p_driver_lat FLOAT, p_driver_lng FLOAT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_is_test_account BOOLEAN;
    v_distance_meters FLOAT;
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.status != 'in_transit' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_IN_TRANSIT');
    END IF;
    IF v_trip.arrived_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ARRIVED');
    END IF;

    -- Get first order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ORDER');
    END IF;
    IF v_order.delivery_lat IS NULL OR v_order.delivery_lng IS NULL THEN
         v_distance_meters := 0;
    ELSE
         -- Use existing reliable function returning meters
         v_distance_meters := public.calculate_haversine_distance(p_driver_lat, p_driver_lng, v_order.delivery_lat, v_order.delivery_lng);
         
         SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
         
         IF v_distance_meters > 150 AND NOT v_is_test_account THEN
             RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR', 'distance_meters', v_distance_meters);
         END IF;
    END IF;

    UPDATE public.logistics_trips 
    SET arrived_at = NOW(), 
        updated_at = NOW()
    WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_trip_id UUID, p_cod_collected BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_otp_rec RECORD;
    v_warehouse RECORD;
    v_distance_meters FLOAT;
    v_auth_route_distance_meters DECIMAL(10,2);
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.arrived_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ARRIVED');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1;
    
    -- OTP Requirement Check
    IF v_order.total_amount > 1000 THEN
        SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = v_order.id;
        IF v_otp_rec.status != 'verified' THEN
             RETURN jsonb_build_object('success', false, 'code', 'OTP_REQUIRED');
        END IF;
    END IF;
    
    -- COD Requirement Check
    IF v_order.payment_method = 'cod' THEN
        IF NOT p_cod_collected AND NOT COALESCE(v_order.cod_collected, false) THEN
             RETURN jsonb_build_object('success', false, 'code', 'COD_NOT_COLLECTED');
        END IF;
        
        -- Mark COD collected (this fires the ledger trigger natively). We only fire if false to remain idempotent.
        IF NOT COALESCE(v_order.cod_collected, false) THEN
            UPDATE public.orders SET cod_collected = true, updated_at = NOW() WHERE id = v_order.id;
        END IF;
    END IF;
    
    -- Calculate Server-Authoritative Route Distance Fallback
    -- Since backend OSRM isn't built yet, we use a secure server-side Haversine * 1.4 detour index
    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_trip.warehouse_id;
    v_distance_meters := public.calculate_haversine_distance(v_warehouse.latitude, v_warehouse.longitude, v_order.delivery_lat, v_order.delivery_lng);
    v_auth_route_distance_meters := v_distance_meters * 1.4;

    -- Complete Trip
    UPDATE public.logistics_trips 
    SET status = 'completed', 
        route_distance_meters = v_auth_route_distance_meters,
        updated_at = NOW() 
    WHERE id = p_trip_id;
    
    -- Complete Order
    UPDATE public.orders SET status = 'delivered', updated_at = NOW() WHERE id = v_order.id;
    
    -- Check long distance return (> 5000 meters route distance)
    IF v_auth_route_distance_meters > 5000 THEN
        INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id)
        VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id);
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;


-- ==========================================================
-- 4. Acknowledge Completion
-- ==========================================================
CREATE OR REPLACE FUNCTION public.driver_acknowledge_completion(p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
BEGIN
    UPDATE public.logistics_trips 
    SET completion_acknowledged_at = NOW() 
    WHERE id = p_trip_id 
      AND driver_id = v_driver_id 
      AND status = 'completed' 
      AND completion_acknowledged_at IS NULL;
    RETURN jsonb_build_object('success', true);
END;
$$;


-- ==========================================================
-- 5. Store QR Return Geofence fix
-- ==========================================================
CREATE OR REPLACE FUNCTION public.driver_complete_return_to_store(p_qr_token TEXT, p_lat FLOAT, p_lng FLOAT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_task RECORD;
    v_warehouse RECORD;
    v_is_test_account BOOLEAN;
    v_distance_meters FLOAT;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE driver_id = v_driver_id AND status = 'required' LIMIT 1 FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    -- Validate geofence strictly using check-in's 200m radius rule (established pattern)
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
    
    IF v_distance_meters > 200 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    UPDATE public.driver_return_tasks SET status = 'completed', completed_at = NOW() WHERE id = v_task.id;
    
    RETURN jsonb_build_object('success', true);
END;
$$;


-- ==========================================================
-- 6. Customer OTP Trigger update (Generate at in_transit, send notification)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
BEGIN
    -- Only generate OTP when status becomes in_transit so it doesn't expire too early
    IF NEW.total_amount > 1000.00 AND OLD.status != 'in_transit' AND NEW.status = 'in_transit' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, crypt(v_otp, gen_salt('bf')), NOW() + INTERVAL '4 hours')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Insert into notifications table (mocking actual delivery via SMS/push)
        -- Customers check this to get their code in the user-app.
        INSERT INTO public.notifications (user_id, title, body, type, related_id)
        VALUES (NEW.customer_id, 'Delivery OTP', 'Your delivery OTP for order ' || NEW.order_number || ' is ' || v_otp, 'DELIVERY_OTP', NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

-- Note: In transit is updated when driver confirms pickup.
CREATE OR REPLACE FUNCTION public.driver_confirm_order_pickup(p_trip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
BEGIN
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    IF v_trip.status != 'accepted' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATE');
    END IF;

    -- Note: check if all orders are packed if we supported multi-order, but for now we assume they are.
    UPDATE public.orders SET status = 'in_transit', updated_at = NOW() WHERE trip_id = p_trip_id;
    UPDATE public.logistics_trips SET status = 'in_transit', in_transit_at = NOW(), updated_at = NOW() WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
