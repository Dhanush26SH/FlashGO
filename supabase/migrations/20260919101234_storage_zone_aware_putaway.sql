-- Migration: 20260919101234_storage_zone_aware_putaway.sql
-- Description: Implement storage-zone-aware putaway destination allocation.

CREATE OR REPLACE FUNCTION public.warehouse_putaway_ensure_destination(p_task_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_task RECORD;
    v_candidate RECORD;
    v_locked_loc RECORD;
    v_used_quantity INTEGER;
    v_reserved_quantity INTEGER;
    v_available INTEGER;
    v_storage_zone TEXT;
BEGIN
    -- 1. Lock Putaway Task
    SELECT * INTO v_task 
    FROM public.putaway_tasks 
    WHERE id = p_task_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;

    IF v_task.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Task must be pending or in_progress to allocate destination';
    END IF;

    -- Idempotency check
    IF v_task.destination_location IS NOT NULL THEN
        SELECT * INTO v_locked_loc 
        FROM public.warehouse_locations 
        WHERE warehouse_id = v_task.warehouse_id AND location_code = v_task.destination_location;
        
        IF FOUND THEN
            RETURN jsonb_build_object(
                'location_id', v_locked_loc.id,
                'location_code', v_locked_loc.location_code,
                'zone', v_locked_loc.zone,
                'rack', v_locked_loc.rack,
                'shelf_level', v_locked_loc.shelf_level,
                'position', v_locked_loc.position,
                'qr_payload', v_locked_loc.barcode
            );
        END IF;
    END IF;

    -- 1.5. Fetch product storage zone
    SELECT c.storage_zone INTO v_storage_zone
    FROM public.products p
    JOIN public.categories c ON p.category_id = c.id
    WHERE p.id = v_task.product_id;

    IF v_storage_zone IS NULL THEN
        RAISE EXCEPTION 'Product % category lacks a defined storage_zone', v_task.product_id;
    END IF;

    -- 2. Candidate Loop (unlocked query to establish deterministic priority)
    -- Priority: Affinity first, then smallest sufficient estimated available capacity, then location code
    FOR v_candidate IN (
        SELECT wl.*,
               (CASE WHEN EXISTS (
                   SELECT 1 FROM public.warehouse_product_placements 
                   WHERE location_id = wl.id AND product_id = v_task.product_id
               ) THEN 0 ELSE 1 END) AS affinity_score,
               (wl.capacity - 
                COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = wl.id), 0) - 
                COALESCE((SELECT SUM(quantity) FROM public.putaway_tasks 
                          WHERE warehouse_id = wl.warehouse_id 
                            AND destination_location = wl.location_code 
                            AND status IN ('pending', 'in_progress') 
                            AND id <> p_task_id), 0)
               ) AS estimated_available
        FROM public.warehouse_locations wl
        WHERE wl.warehouse_id = v_task.warehouse_id
          AND wl.is_active = true
          AND (
              (v_storage_zone = 'ambient' AND wl.zone LIKE 'A%') OR
              (v_storage_zone != 'ambient' AND wl.zone = v_storage_zone)
          )
        ORDER BY 
            affinity_score ASC,
            estimated_available ASC,
            wl.location_code ASC
    ) LOOP
        -- Lock Candidate Location
        SELECT * INTO v_locked_loc 
        FROM public.warehouse_locations 
        WHERE id = v_candidate.id 
        FOR UPDATE;

        -- 3. Recalculate Live Capacity
        SELECT COALESCE(SUM(quantity), 0) INTO v_used_quantity 
        FROM public.warehouse_product_placements 
        WHERE location_id = v_locked_loc.id;

        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_quantity 
        FROM public.putaway_tasks 
        WHERE warehouse_id = v_locked_loc.warehouse_id 
          AND destination_location = v_locked_loc.location_code 
          AND status IN ('pending', 'in_progress') 
          AND id <> v_task.id;

        v_available := v_locked_loc.capacity - v_used_quantity - v_reserved_quantity;

        -- 4. Assign Destination if sufficient
        IF v_available >= v_task.quantity THEN
            UPDATE public.putaway_tasks 
            SET destination_location = v_locked_loc.location_code 
            WHERE id = v_task.id;
            
            RETURN jsonb_build_object(
                'location_id', v_locked_loc.id,
                'location_code', v_locked_loc.location_code,
                'zone', v_locked_loc.zone,
                'rack', v_locked_loc.rack,
                'shelf_level', v_locked_loc.shelf_level,
                'position', v_locked_loc.position,
                'qr_payload', v_locked_loc.barcode
            );
        END IF;
    END LOOP;

    -- No suitable location found
    RAISE EXCEPTION 'PUTAWAY_NO_DESTINATION_AVAILABLE: No compatible % location found with sufficient capacity', v_storage_zone;
END;
$$;
