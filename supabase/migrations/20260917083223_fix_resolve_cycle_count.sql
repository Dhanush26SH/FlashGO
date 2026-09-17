-- Fix for admin_audit_logs schema mismatch in resolve_cycle_count

CREATE OR REPLACE FUNCTION resolve_cycle_count(
    p_count_id UUID,
    p_status TEXT, -- 'approved' or 'rejected'
    p_user_id UUID,
    p_location_id UUID DEFAULT NULL
) RETURNS void 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count RECORD;
    v_warehouse_id UUID;
    v_role TEXT;
BEGIN
    SELECT warehouse_id, role INTO v_warehouse_id, v_role FROM public.profiles 
    WHERE id = p_user_id AND is_suspended = FALSE;

    IF v_role NOT IN ('admin', 'warehouse_manager') THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_count FROM public.cycle_counts WHERE id = p_count_id FOR UPDATE;
    IF v_count.id IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;
    IF v_count.status != 'submitted' THEN RAISE EXCEPTION 'Count must be submitted to be resolved'; END IF;
    IF v_count.warehouse_id != v_warehouse_id AND v_role != 'admin' THEN RAISE EXCEPTION 'Cross-warehouse resolution blocked'; END IF;
    
    IF p_status = 'approved' AND v_count.variance != 0 THEN
        IF p_location_id IS NULL THEN
            RAISE EXCEPTION 'A valid location_id is required for physical inventory adjustments';
        END IF;

        IF v_count.batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET available_quantity = available_quantity + v_count.variance
            WHERE id = v_count.batch_id;
        END IF;

        UPDATE public.warehouse_stock 
        SET quantity = quantity + v_count.variance
        WHERE warehouse_id = v_count.warehouse_id AND product_id = v_count.product_id;

        -- Strict Placement Integrity
        INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
        VALUES (v_count.warehouse_id, p_location_id, v_count.product_id, GREATEST(v_count.variance, 0), 'cycle_count')
        ON CONFLICT (location_id, product_id) 
        DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

        INSERT INTO public.stock_ledgers (
            warehouse_id, product_id, batch_id, quantity_change, reason, performed_by
        ) VALUES (
            v_count.warehouse_id, v_count.product_id, v_count.batch_id, v_count.variance, 'cycle_count', p_user_id
        );
    END IF;

    UPDATE public.cycle_counts 
    SET status = p_status, reviewer_id = p_user_id, resolved_at = now()
    WHERE id = p_count_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, 
        action_type, 
        entity_type, 
        entity_id, 
        warehouse_id,
        metadata
    ) VALUES (
        p_user_id, 
        'cycle_count_' || p_status, 
        'cycle_count', 
        p_count_id::text, 
        v_count.warehouse_id,
        jsonb_build_object('product_id', v_count.product_id, 'batch_id', v_count.batch_id, 'variance', v_count.variance, 'location_id', p_location_id)
    );
END;
$$;
