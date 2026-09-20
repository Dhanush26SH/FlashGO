-- Migration: 20260921003000_drop_zone_qr_validation.sql
-- Harden Drop Zone QR verification by validating warehouse and active status

DROP FUNCTION IF EXISTS public.picker_confirm_drop_zone(UUID, TEXT);
DROP FUNCTION IF EXISTS public.driver_pickup_from_drop_zone(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.picker_confirm_drop_zone(p_order_id UUID, p_warehouse_id UUID, p_qr_token TEXT)
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
    
    IF v_drop_zone.warehouse_id != p_warehouse_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WAREHOUSE');
    END IF;

    IF v_drop_zone.is_active != true THEN
        RETURN jsonb_build_object('success', false, 'code', 'INACTIVE_ZONE');
    END IF;

    IF v_drop_zone.qr_token::text != p_qr_token THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_QR_TOKEN');
    END IF;

    UPDATE public.drop_zone_allocations SET status = 'placed', placed_at = NOW() WHERE id = v_allocation.id;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_pickup_from_drop_zone(p_trip_id UUID, p_warehouse_id UUID, p_qr_token TEXT)
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
    
    IF v_drop_zone.warehouse_id != p_warehouse_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WAREHOUSE');
    END IF;

    IF v_drop_zone.is_active != true THEN
        RETURN jsonb_build_object('success', false, 'code', 'INACTIVE_ZONE');
    END IF;

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
