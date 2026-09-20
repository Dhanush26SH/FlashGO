-- Migration: 20260921002900_drop_zone_phase2.sql
-- Description: Drop Zone Fallback Flow Phase 2

CREATE TABLE public.drop_zone_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id),
    trip_id UUID NOT NULL REFERENCES public.logistics_trips(id),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    drop_zone_id UUID NOT NULL REFERENCES public.drop_zones(id),
    picker_id UUID NOT NULL REFERENCES public.profiles(id),
    
    status TEXT NOT NULL CHECK (status IN ('allocated', 'placed', 'driver_assigned', 'picked_up', 'voided')),
    
    placed_at TIMESTAMPTZ,
    driver_id UUID REFERENCES public.profiles(id),
    driver_assigned_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STRICT CAPACITY: Prevent double-booking a physical drop zone (max 1 active order per zone)
CREATE UNIQUE INDEX drop_zone_single_occupancy_idx 
ON public.drop_zone_allocations(drop_zone_id) 
WHERE status IN ('allocated', 'placed', 'driver_assigned');

-- Prevent an order from being in multiple drop zones
CREATE UNIQUE INDEX drop_zone_single_order_idx 
ON public.drop_zone_allocations(order_id) 
WHERE status IN ('allocated', 'placed', 'driver_assigned');

-- RLS
ALTER TABLE public.drop_zone_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow picker read access" ON public.drop_zone_allocations FOR SELECT TO authenticated
USING (picker_id = auth.uid() OR driver_id = auth.uid() OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')));

-- RPCs

CREATE OR REPLACE FUNCTION public.allocate_fallback_drop_zone(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_picker_id UUID := auth.uid();
    v_order RECORD;
    v_trip RECORD;
    v_drop_zone_id UUID;
    v_zone_code TEXT;
    v_allocation_id UUID;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND picker_id = v_picker_id AND status = 'packed';
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ORDER');
    END IF;

    -- Lock offers FIRST to match claim_trip's lock hierarchy and prevent deadlock
    PERFORM 1 FROM public.driver_trip_offers WHERE trip_id = v_order.trip_id AND status = 'offered' FOR UPDATE;
    
    -- Lock trip SECOND
    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = v_order.trip_id FOR UPDATE;

    IF v_trip.driver_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_ALREADY_ASSIGNED');
    END IF;

    IF (NOW() - v_trip.created_at) < INTERVAL '15 seconds' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_EARLY');
    END IF;

    -- Expire pending offers atomically so claim_trip natively fails with EXPIRED_OFFER
    UPDATE public.driver_trip_offers SET status = 'expired', responded_at = NOW() WHERE trip_id = v_order.trip_id AND status = 'offered';

    -- Check if it's already allocated (in case of double submission)
    SELECT id, drop_zone_id INTO v_allocation_id, v_drop_zone_id FROM public.drop_zone_allocations 
    WHERE order_id = v_order.id AND status IN ('allocated', 'placed', 'driver_assigned');
    
    IF v_allocation_id IS NOT NULL THEN
        SELECT zone_code INTO v_zone_code FROM public.drop_zones WHERE id = v_drop_zone_id;
        RETURN jsonb_build_object('success', true, 'zone_code', v_zone_code, 'drop_zone_id', v_drop_zone_id);
    END IF;

    -- Allocate empty zone
    SELECT id, zone_code INTO v_drop_zone_id, v_zone_code
    FROM public.drop_zones dz
    WHERE dz.warehouse_id = v_order.warehouse_id
      AND dz.is_active = true
      AND NOT EXISTS (
          SELECT 1 FROM public.drop_zone_allocations dza 
          WHERE dza.drop_zone_id = dz.id 
          AND dza.status IN ('allocated', 'placed', 'driver_assigned')
      )
    ORDER BY dz.zone_code
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_drop_zone_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_FREE_DROP_ZONE');
    END IF;

    INSERT INTO public.drop_zone_allocations (order_id, trip_id, warehouse_id, drop_zone_id, picker_id, status)
    VALUES (v_order.id, v_order.trip_id, v_order.warehouse_id, v_drop_zone_id, v_picker_id, 'allocated')
    RETURNING id INTO v_allocation_id;

    RETURN jsonb_build_object('success', true, 'zone_code', v_zone_code, 'drop_zone_id', v_drop_zone_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.picker_confirm_drop_zone(p_order_id UUID, p_qr_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_picker_id UUID := auth.uid();
    v_allocation RECORD;
    v_drop_zone RECORD;
BEGIN
    SELECT dza.* INTO v_allocation FROM public.drop_zone_allocations dza 
    WHERE dza.order_id = p_order_id AND dza.picker_id = v_picker_id AND dza.status = 'allocated' FOR UPDATE;
    
    IF v_allocation.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ALLOCATION');
    END IF;

    SELECT * INTO v_drop_zone FROM public.drop_zones WHERE id = v_allocation.drop_zone_id;
    
    IF v_drop_zone.qr_token::text != p_qr_token THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    UPDATE public.drop_zone_allocations SET status = 'placed', placed_at = NOW() WHERE id = v_allocation.id;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_pickup_from_drop_zone(p_trip_id UUID, p_qr_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_allocation RECORD;
    v_drop_zone RECORD;
BEGIN
    SELECT dza.* INTO v_allocation FROM public.drop_zone_allocations dza 
    WHERE dza.trip_id = p_trip_id AND dza.driver_id = v_driver_id AND dza.status = 'driver_assigned' FOR UPDATE;
    
    IF v_allocation.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ALLOCATION');
    END IF;

    SELECT * INTO v_drop_zone FROM public.drop_zones WHERE id = v_allocation.drop_zone_id;
    
    IF v_drop_zone.qr_token::text != p_qr_token THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    UPDATE public.drop_zone_allocations SET status = 'picked_up', picked_up_at = NOW() WHERE id = v_allocation.id;

    -- Rejoin existing delivery flow
    UPDATE public.logistics_trips SET status = 'in_transit', updated_at = NOW() WHERE id = p_trip_id;
    UPDATE public.orders SET status = 'out_for_delivery', updated_at = NOW() WHERE id = v_allocation.order_id;
    
    INSERT INTO public.order_events (order_id, actor_id, event_type, previous_status, new_status, description)
    VALUES (v_allocation.order_id, v_driver_id, 'picked_up_drop_zone', 'packed', 'out_for_delivery', 'Driver picked up from Drop Zone ' || v_drop_zone.zone_code);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Update run_dispatch_cycle to exclude drop zone trips
CREATE OR REPLACE FUNCTION public.run_dispatch_cycle(p_warehouse_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
          -- PHASE 2 EXCLUSION: exclude trips that are safely inside a drop zone allocation
          AND NOT EXISTS (
              SELECT 1 FROM public.drop_zone_allocations dza
              WHERE dza.trip_id = lt.id AND dza.status IN ('allocated', 'placed', 'driver_assigned')
          )
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
              SELECT 1 FROM public.driver_trip_offers active_dto
              WHERE active_dto.driver_id = p.id
                AND active_dto.status = 'offered'
                AND active_dto.expires_at > NOW()
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
            ds.updated_at ASC
        FOR UPDATE OF p SKIP LOCKED
        LIMIT 1;

        IF v_driver_id IS NOT NULL THEN
            INSERT INTO public.driver_trip_offers (trip_id, driver_id, attempt_number, expires_at)
            VALUES (v_trip.id, v_driver_id, v_attempt_count + 1, NOW() + INTERVAL '60 seconds');
        END IF;
    END LOOP;
END;
$$;

-- Update driver_complete_return_to_store to atomically claim drop zone
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
    v_qr_id UUID;
    v_waiting_allocation RECORD;
BEGIN
    SELECT * INTO v_task FROM public.driver_return_tasks WHERE driver_id = v_driver_id AND status = 'required' LIMIT 1 FOR UPDATE;
    IF v_task.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_RETURN_REQUIRED');
    END IF;

    SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_task.warehouse_id;
    
    v_distance_meters := public.calculate_haversine_distance(p_lat, p_lng, v_warehouse.lat, v_warehouse.lng);
    SELECT EXISTS(SELECT 1 FROM public.dev_test_accounts WHERE email = (SELECT email FROM auth.users WHERE id = v_driver_id) AND bypass_geofence = true) INTO v_is_test_account;
    
    IF v_distance_meters > 200 AND NOT v_is_test_account THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_FAR');
    END IF;
    
    SELECT id INTO v_qr_id
    FROM public.warehouse_qr_challenges
    WHERE warehouse_id = v_task.warehouse_id AND raw_token = p_qr_token AND expires_at > NOW();

    IF v_qr_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;
    
    UPDATE public.driver_return_tasks SET status = 'completed', completed_at = NOW() WHERE id = v_task.id;
    
    -- PHASE 2: Check for placed drop zone allocation and atomically claim
    SELECT dza.* INTO v_waiting_allocation FROM public.drop_zone_allocations dza
    WHERE dza.warehouse_id = v_warehouse.id AND dza.status = 'placed'
    ORDER BY dza.placed_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

    IF v_waiting_allocation.id IS NOT NULL THEN
        UPDATE public.drop_zone_allocations SET status = 'driver_assigned', driver_id = v_driver_id, driver_assigned_at = NOW() WHERE id = v_waiting_allocation.id;
        UPDATE public.logistics_trips SET status = 'accepted', driver_id = v_driver_id, updated_at = NOW() WHERE id = v_waiting_allocation.trip_id;
        UPDATE public.orders SET driver_id = v_driver_id, updated_at = NOW() WHERE id = v_waiting_allocation.order_id;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;
