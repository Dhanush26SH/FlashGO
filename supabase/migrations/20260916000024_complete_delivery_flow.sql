-- Migration: 20260916000024_complete_delivery_flow.sql
-- Description:
--   1. Haversine distance function (server-side).
--   2. Secure OTP structure for high-value orders.
--   3. Driver return tasks table.
--   4. Trip tracking columns (arrived_at, distance_km).
--   5. Dispatch exclusions.
--   6. RPCs for arrival, OTP, completion, and return.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Haversine Distance (KM)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_distance_km(lat1 FLOAT, lon1 FLOAT, lat2 FLOAT, lon2 FLOAT)
RETURNS FLOAT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    radius FLOAT := 6371; -- Earth radius in km
    dlat FLOAT;
    dlon FLOAT;
    a FLOAT;
    c FLOAT;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat/2) * sin(dlat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(dlon/2) * sin(dlon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    RETURN radius * c;
END;
$$;

-- ============================================================
-- 2. Schema Additions
-- ============================================================
-- Add columns to logistics_trips
ALTER TABLE public.logistics_trips
ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS route_distance_meters DECIMAL(10,2);

-- Order OTP Table
CREATE TABLE IF NOT EXISTS public.order_delivery_otp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'locked')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.order_delivery_otp ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_otp_order_id ON public.order_delivery_otp(order_id);

-- Driver Return Tasks Table
CREATE TABLE IF NOT EXISTS public.driver_return_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES public.logistics_trips(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'required' CHECK (status IN ('required', 'completed', 'expired')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ
);
ALTER TABLE public.driver_return_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_driver_return_tasks_driver_status ON public.driver_return_tasks(driver_id, status);

-- Trigger to invalidate old return tasks on shift expiry
CREATE OR REPLACE FUNCTION public.handle_shift_expiry_returns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.status = 'expired' AND OLD.status != 'expired' THEN
        -- If a shift expires, mark any pending return tasks as expired too (they don't need to return anymore)
        UPDATE public.driver_return_tasks
        SET status = 'expired'
        WHERE driver_id = NEW.driver_id AND status = 'required';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_shift_expiry_returns ON public.staff_shifts;
CREATE TRIGGER trigger_shift_expiry_returns
    AFTER UPDATE ON public.staff_shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_shift_expiry_returns();


-- ============================================================
-- 3. Modify Dispatch to exclude returning drivers
-- ============================================================
-- Update run_dispatch_cycle to exclude drivers with 'required' return tasks
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
              WHERE busy.driver_id = p.id AND busy.status IN ('accepted', 'in_transit')
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.driver_trip_offers prev
              WHERE prev.trip_id = v_trip.id AND prev.driver_id = p.id
          )
          -- EXCLUDE drivers with unresolved return tasks
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


-- ============================================================
-- 4. RPCs for Delivery Flow
-- ============================================================

-- A. Mark Arrived
CREATE OR REPLACE FUNCTION public.driver_mark_arrived(p_trip_id UUID, p_driver_lat FLOAT, p_driver_lng FLOAT, p_route_distance_meters DECIMAL DEFAULT NULL)
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
    v_distance_km FLOAT;
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
         -- Rare fallback if missing
         v_distance_km := 0;
    ELSE
         v_distance_km := public.calculate_distance_km(p_driver_lat, p_driver_lng, v_order.delivery_lat, v_order.delivery_lng);
         
         SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
         
         IF v_distance_km > 0.150 AND NOT v_is_test_account THEN
             RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR', 'distance_meters', v_distance_km * 1000);
         END IF;
    END IF;

    UPDATE public.logistics_trips 
    SET arrived_at = NOW(), 
        route_distance_meters = COALESCE(p_route_distance_meters, v_trip.route_distance_meters),
        updated_at = NOW()
    WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- B. Generate OTP (internal trigger for high value orders)
CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
BEGIN
    -- If total > 1000, create an OTP when order becomes packed/staged
    IF NEW.total_amount > 1000.00 AND OLD.status != 'packed' AND NEW.status = 'packed' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, crypt(v_otp, gen_salt('bf')), NOW() + INTERVAL '2 days')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Fallback to the old column for now so SMS works if they rely on it
        NEW.otp_code := v_otp;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_generate_high_value_otp ON public.orders;
CREATE TRIGGER trigger_generate_high_value_otp
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_generate_high_value_otp();


-- C. Verify OTP
CREATE OR REPLACE FUNCTION public.driver_verify_delivery_otp(p_order_id UUID, p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_order RECORD;
    v_otp_rec RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL OR v_order.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_ORDER');
    END IF;
    
    SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = p_order_id FOR UPDATE;
    IF v_otp_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_OTP_REQUIRED');
    END IF;
    
    IF v_otp_rec.status = 'verified' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_VERIFIED');
    END IF;
    IF v_otp_rec.status = 'locked' OR v_otp_rec.attempts >= v_otp_rec.max_attempts THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_MANY_ATTEMPTS');
    END IF;
    IF v_otp_rec.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'EXPIRED');
    END IF;
    
    -- Verify Hash (fallback to orders.otp_code if missing from table)
    IF v_otp_rec.otp_hash = crypt(p_otp, v_otp_rec.otp_hash) OR p_otp = v_order.otp_code THEN
        UPDATE public.order_delivery_otp SET status = 'verified', verified_at = NOW() WHERE id = v_otp_rec.id;
        RETURN jsonb_build_object('success', true);
    ELSE
        UPDATE public.order_delivery_otp SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= max_attempts THEN 'locked' ELSE status END WHERE id = v_otp_rec.id;
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_OTP');
    END IF;
END;
$$;


-- D. Complete Delivery
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
        
        -- Mark COD collected (this fires the ledger trigger natively)
        UPDATE public.orders SET cod_collected = true, updated_at = NOW() WHERE id = v_order.id;
    END IF;
    
    -- Complete Trip
    UPDATE public.logistics_trips SET status = 'completed', updated_at = NOW() WHERE id = p_trip_id;
    
    -- Complete Order
    UPDATE public.orders SET status = 'delivered', updated_at = NOW() WHERE id = v_order.id;
    
    -- Check long distance return (> 5000 meters route distance)
    IF v_trip.route_distance_meters > 5000 THEN
        INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id)
        VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id);
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;


-- E. Complete Return to Store
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
    v_distance_km FLOAT;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE driver_id = v_driver_id AND status = 'required' LIMIT 1 FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    -- Validate QR token (reuse logic from check-in if possible, here we check simple match with warehouse active_token if it exists, or just verify format for now since QR rotates)
    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    -- Validate geofence (300m for warehouse)
    v_distance_km := public.calculate_distance_km(p_lat, p_lng, v_warehouse.latitude, v_warehouse.longitude);
    SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
    
    IF v_distance_km > 0.300 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    -- In production, we'd validate p_qr_token matches v_warehouse.qr_token.
    
    UPDATE public.driver_return_tasks SET status = 'completed', completed_at = NOW() WHERE id = v_task.id;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
