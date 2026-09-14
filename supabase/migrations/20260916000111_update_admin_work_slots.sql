CREATE OR REPLACE FUNCTION public.admin_get_work_slots()
RETURNS TABLE (
    id UUID,
    warehouse_id UUID,
    warehouse_name TEXT,
    target_role TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    capacity INT,
    status TEXT,
    booked_count BIGINT,
    estimated_hourly_rate_min NUMERIC,
    estimated_hourly_rate_max NUMERIC,
    picker_incentive_enabled BOOLEAN,
    picker_incentives JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT * INTO v_profile FROM public.profiles p WHERE p.id = auth.uid();
    IF v_profile IS NULL OR v_profile.role NOT IN ('admin', 'warehouse_manager', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        ws.id,
        ws.warehouse_id,
        w.name AS warehouse_name,
        ws.target_role,
        ws.start_time,
        ws.end_time,
        ws.capacity,
        ws.status,
        (SELECT COUNT(*) FROM public.staff_shifts ss WHERE ss.work_slot_id = ws.id AND ss.status != 'cancelled') AS booked_count,
        ws.estimated_hourly_rate_min,
        ws.estimated_hourly_rate_max,
        ws.picker_incentive_enabled,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'target_items', inc.target_items,
                'reward_amount', inc.reward_amount,
                'sort_order', inc.sort_order
            ) ORDER BY inc.sort_order)
             FROM public.work_slot_picker_incentives inc
             WHERE inc.work_slot_id = ws.id), 
            '[]'::jsonb
        ) AS picker_incentives
    FROM public.work_slots ws
    JOIN public.warehouses w ON w.id = ws.warehouse_id
    WHERE (v_profile.warehouse_id IS NULL OR ws.warehouse_id = v_profile.warehouse_id)
    ORDER BY ws.start_time DESC;
END;
$$;
