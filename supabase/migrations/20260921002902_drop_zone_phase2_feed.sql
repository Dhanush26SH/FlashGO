-- Migration: 20260921002902_drop_zone_phase2_feed.sql
-- Description: Include Drop Zone Code in Driver Operations Feed

CREATE OR REPLACE FUNCTION public.get_driver_operations_feed()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_driver_id UUID := auth.uid();
    v_session_id UUID;
    v_shift_id UUID;
    v_warehouse_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_role TEXT;
    
    v_active_trip JSONB;
    v_pending_offer JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    -- Expire any naturally expired offers for this driver first (clean up)
    UPDATE public.driver_trip_offers
    SET status = 'expired', responded_at = NOW()
    WHERE driver_id = v_driver_id AND status = 'offered' AND expires_at <= NOW();

    -- Fetch driver state
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_role, v_is_online, v_is_suspended
    FROM public.profiles WHERE id = v_driver_id;

    IF v_role != 'driver' OR v_is_suspended = TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'INELIGIBLE');
    END IF;

    -- Fetch active session and warehouse
    SELECT ds.id, ss.id, ss.warehouse_id, ss.shift_end
    INTO v_session_id, v_shift_id, v_warehouse_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Check for Active Trip first, joining drop_zone_allocations for Phase 2
    SELECT jsonb_build_object(
        'id', lt.id,
        'status', lt.status,
        'completion_acknowledged_at', lt.completion_acknowledged_at,
        'drop_zone_code', dz.zone_code
    ) INTO v_active_trip
    FROM public.logistics_trips lt
    LEFT JOIN public.drop_zone_allocations dza ON dza.trip_id = lt.id AND dza.status = 'driver_assigned'
    LEFT JOIN public.drop_zones dz ON dz.id = dza.drop_zone_id
    WHERE lt.driver_id = v_driver_id 
      AND (
        lt.status IN ('accepted', 'in_transit')
        OR (lt.status = 'completed' AND lt.completion_acknowledged_at IS NULL)
      )
    ORDER BY lt.created_at DESC
    LIMIT 1;

    IF v_active_trip IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'server_now', NOW(),
            'active_trip', v_active_trip,
            'pending_offer', NULL
        );
    END IF;

    -- If online, look for an active offer targeting THIS specific driver
    IF v_is_online THEN
        SELECT jsonb_build_object(
            'id', lt.id,
            'status', lt.status,
            'offered_at', dto.offered_at,
            'offer_expires_at', dto.expires_at,
            'warehouse_id', w.id,
            'warehouse_name', w.name,
            'warehouse_address', w.address,
            'order_id', o.id,
            'order_number', o.order_number,
            'picker_name', COALESCE(p.full_name, 'Assigning')
        ) INTO v_pending_offer
        FROM public.driver_trip_offers dto
        JOIN public.logistics_trips lt ON dto.trip_id = lt.id
        JOIN public.warehouses w ON lt.warehouse_id = w.id
        LEFT JOIN public.orders o ON o.trip_id = lt.id
        LEFT JOIN public.profiles p ON o.picker_id = p.id
        WHERE dto.driver_id = v_driver_id
          AND dto.status = 'offered'
          AND dto.expires_at > NOW()
          AND lt.status = 'pending'
        ORDER BY dto.offered_at DESC
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'server_now', NOW(),
        'active_trip', NULL,
        'pending_offer', v_pending_offer
    );
END;
$function$;
