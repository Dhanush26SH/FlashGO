-- Migration: 20260916000028_warehouse_locations_placements.sql
-- Description: Implement physical locations, placements, and history exactly as requested for Udupi D0 layout.

-- 1. warehouse_locations
CREATE TABLE IF NOT EXISTS public.warehouse_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    location_code TEXT NOT NULL,
    barcode TEXT NOT NULL,
    zone TEXT NOT NULL,
    rack TEXT NOT NULL,
    shelf_level TEXT NOT NULL,
    position TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (warehouse_id, location_code),
    UNIQUE (barcode)
);

-- 2. warehouse_product_placements
CREATE TABLE IF NOT EXISTS public.warehouse_product_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    placement_source TEXT,
    UNIQUE (location_id, product_id)
);

-- 3. warehouse_placement_events
CREATE TABLE IF NOT EXISTS public.warehouse_placement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    from_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Storage Zone classification on categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS storage_zone TEXT DEFAULT 'ambient';
-- Pre-fill some obvious categories
UPDATE public.categories SET storage_zone = 'FV01' WHERE slug ILIKE '%veg%' OR slug ILIKE '%fruit%';
UPDATE public.categories SET storage_zone = 'CR01' WHERE slug ILIKE '%milk%' OR slug ILIKE '%dairy%' OR slug ILIKE '%chill%';
UPDATE public.categories SET storage_zone = 'FR01' WHERE slug ILIKE '%ice%cream%' OR slug ILIKE '%frozen%';

-- 4. Bootstrap Physical Layout (Idempotent)
CREATE OR REPLACE FUNCTION public.bootstrap_warehouse_physical_layout(p_warehouse_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_zones TEXT[] := ARRAY['A01', 'A02', 'A03'];
    v_zone TEXT;
    v_rack INT;
    v_level INT;
    v_pos TEXT;
    v_rack_str TEXT;
    v_level_str TEXT;
    v_loc_code TEXT;
    v_barcode TEXT;
    v_count INT := 0;
BEGIN
    -- General Storage (A01, A02, A03)
    FOREACH v_zone IN ARRAY v_zones
    LOOP
        FOR v_rack IN 1..20 LOOP
            v_rack_str := lpad(v_rack::text, 3, '0');
            FOR v_level IN 1..7 LOOP
                v_level_str := lpad(v_level::text, 2, '0');
                FOREACH v_pos IN ARRAY ARRAY['A', 'B', 'C'] LOOP
                    v_loc_code := 'D0-' || v_zone || '-' || v_rack_str || '-' || v_level_str || '-' || v_pos;
                    v_barcode := p_warehouse_id || '-' || v_loc_code;
                    INSERT INTO public.warehouse_locations (warehouse_id, location_code, barcode, zone, rack, shelf_level, position, capacity)
                    VALUES (p_warehouse_id, v_loc_code, v_barcode, v_zone, v_rack_str, v_level_str, v_pos, 50)
                    ON CONFLICT (warehouse_id, location_code) DO NOTHING;
                    IF FOUND THEN v_count := v_count + 1; END IF;
                END LOOP;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Fresh Vegetables (FV01)
    FOR v_rack IN 1..5 LOOP
        v_rack_str := lpad(v_rack::text, 3, '0');
        FOR v_level IN 1..7 LOOP
            v_level_str := lpad(v_level::text, 2, '0');
            FOREACH v_pos IN ARRAY ARRAY['A', 'B', 'C'] LOOP
                v_loc_code := 'D0-FV01-' || v_rack_str || '-' || v_level_str || '-' || v_pos;
                v_barcode := p_warehouse_id || '-' || v_loc_code;
                INSERT INTO public.warehouse_locations (warehouse_id, location_code, barcode, zone, rack, shelf_level, position, capacity)
                VALUES (p_warehouse_id, v_loc_code, v_barcode, 'FV01', v_rack_str, v_level_str, v_pos, 50)
                ON CONFLICT (warehouse_id, location_code) DO NOTHING;
                IF FOUND THEN v_count := v_count + 1; END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Cold Room (CR01)
    FOR v_rack IN 1..10 LOOP
        v_rack_str := lpad(v_rack::text, 3, '0');
        FOR v_level IN 1..7 LOOP
            v_level_str := lpad(v_level::text, 2, '0');
            FOREACH v_pos IN ARRAY ARRAY['A', 'B', 'C'] LOOP
                v_loc_code := 'D0-CR01-' || v_rack_str || '-' || v_level_str || '-' || v_pos;
                v_barcode := p_warehouse_id || '-' || v_loc_code;
                INSERT INTO public.warehouse_locations (warehouse_id, location_code, barcode, zone, rack, shelf_level, position, capacity)
                VALUES (p_warehouse_id, v_loc_code, v_barcode, 'CR01', v_rack_str, v_level_str, v_pos, 50)
                ON CONFLICT (warehouse_id, location_code) DO NOTHING;
                IF FOUND THEN v_count := v_count + 1; END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    -- Freezer (FR01)
    FOR v_rack IN 1..10 LOOP
        v_rack_str := lpad(v_rack::text, 3, '0');
        FOR v_level IN 1..7 LOOP
            v_level_str := lpad(v_level::text, 2, '0');
            FOREACH v_pos IN ARRAY ARRAY['A', 'B', 'C'] LOOP
                v_loc_code := 'D0-FR01-' || v_rack_str || '-' || v_level_str || '-' || v_pos;
                v_barcode := p_warehouse_id || '-' || v_loc_code;
                INSERT INTO public.warehouse_locations (warehouse_id, location_code, barcode, zone, rack, shelf_level, position, capacity)
                VALUES (p_warehouse_id, v_loc_code, v_barcode, 'FR01', v_rack_str, v_level_str, v_pos, 50)
                ON CONFLICT (warehouse_id, location_code) DO NOTHING;
                IF FOUND THEN v_count := v_count + 1; END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'total_locations_inserted', v_count);
END;
$$;


-- 5. Bootstrap Placements (Idempotent)
CREATE OR REPLACE FUNCTION public.bootstrap_warehouse_product_placements(p_warehouse_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stock RECORD;
    v_unplaced INT;
    v_qty_to_place INT;
    v_location RECORD;
    v_target_zone TEXT;
    v_zones_to_try TEXT[];
    v_stats JSONB := '{}'::jsonb;
    v_success_count INT := 0;
    v_unplaced_count INT := 0;
BEGIN
    -- Check if physical layout exists
    IF NOT EXISTS (SELECT 1 FROM public.warehouse_locations WHERE warehouse_id = p_warehouse_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'WAREHOUSE_LAYOUT_NOT_CONFIGURED');
    END IF;

    -- Iterate over every valid warehouse_stock row with > 0 quantity
    FOR v_stock IN 
        SELECT ws.product_id, ws.quantity, p.category_id, c.storage_zone
        FROM public.warehouse_stock ws
        JOIN public.products p ON p.id = ws.product_id
        LEFT JOIN public.categories c ON c.id = p.category_id
        WHERE ws.warehouse_id = p_warehouse_id AND ws.quantity > 0
        FOR UPDATE OF ws
    LOOP
        -- Calculate unplaced
        SELECT COALESCE(SUM(quantity), 0) INTO v_unplaced 
        FROM public.warehouse_product_placements 
        WHERE warehouse_id = p_warehouse_id AND product_id = v_stock.product_id;
        
        v_unplaced := v_stock.quantity - v_unplaced;
        
        IF v_unplaced <= 0 THEN
            CONTINUE; -- Fully placed
        END IF;

        -- Determine zone mapping
        IF v_stock.storage_zone = 'FV01' THEN v_zones_to_try := ARRAY['FV01'];
        ELSIF v_stock.storage_zone = 'CR01' THEN v_zones_to_try := ARRAY['CR01'];
        ELSIF v_stock.storage_zone = 'FR01' THEN v_zones_to_try := ARRAY['FR01'];
        ELSE v_zones_to_try := ARRAY['A01', 'A02', 'A03'];
        END IF;

        -- Place the unplaced quantity
        WHILE v_unplaced > 0 LOOP
            -- Try to find an existing location with this SKU that has free capacity
            SELECT wl.* INTO v_location
            FROM public.warehouse_locations wl
            JOIN public.warehouse_product_placements wpp ON wpp.location_id = wl.id
            WHERE wl.warehouse_id = p_warehouse_id
              AND wl.is_active = true
              AND wl.zone = ANY(v_zones_to_try)
              AND wpp.product_id = v_stock.product_id
              AND (wl.capacity - COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = wl.id), 0)) > 0
            ORDER BY wl.zone, wl.rack, wl.shelf_level, wl.position
            LIMIT 1 FOR UPDATE OF wl;

            -- If no existing location, find an empty one
            IF v_location IS NULL THEN
                SELECT wl.* INTO v_location
                FROM public.warehouse_locations wl
                WHERE wl.warehouse_id = p_warehouse_id
                  AND wl.is_active = true
                  AND wl.zone = ANY(v_zones_to_try)
                  AND NOT EXISTS (SELECT 1 FROM public.warehouse_product_placements WHERE location_id = wl.id AND quantity > 0)
                ORDER BY wl.zone, wl.rack, wl.shelf_level, wl.position
                LIMIT 1 FOR UPDATE OF wl;
            END IF;

            -- If still no location, find ANY location with capacity in the zone
            IF v_location IS NULL THEN
                SELECT wl.* INTO v_location
                FROM public.warehouse_locations wl
                WHERE wl.warehouse_id = p_warehouse_id
                  AND wl.is_active = true
                  AND wl.zone = ANY(v_zones_to_try)
                  AND (wl.capacity - COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = wl.id), 0)) > 0
                ORDER BY wl.zone, wl.rack, wl.shelf_level, wl.position
                LIMIT 1 FOR UPDATE OF wl;
            END IF;

            IF v_location IS NULL THEN
                -- Insufficient capacity in correct zone
                v_unplaced_count := v_unplaced_count + 1;
                EXIT;
            END IF;

            -- Calculate how much we can place
            DECLARE
                v_used_capacity INT;
                v_free_capacity INT;
            BEGIN
                SELECT COALESCE(SUM(quantity), 0) INTO v_used_capacity FROM public.warehouse_product_placements WHERE location_id = v_location.id;
                v_free_capacity := v_location.capacity - v_used_capacity;
                v_qty_to_place := LEAST(v_unplaced, v_free_capacity);

                -- Upsert placement
                INSERT INTO public.warehouse_product_placements (warehouse_id, location_id, product_id, quantity, placement_source)
                VALUES (p_warehouse_id, v_location.id, v_stock.product_id, v_qty_to_place, 'system_auto_placement')
                ON CONFLICT (location_id, product_id) DO UPDATE SET quantity = warehouse_product_placements.quantity + EXCLUDED.quantity;

                -- Write history
                INSERT INTO public.warehouse_placement_events (warehouse_id, product_id, to_location_id, quantity, event_type, source)
                VALUES (p_warehouse_id, v_stock.product_id, v_location.id, v_qty_to_place, 'initial_placement', 'system_auto_placement');

                v_unplaced := v_unplaced - v_qty_to_place;
            END;
        END LOOP;

        IF v_unplaced = 0 THEN
            v_success_count := v_success_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'placed_products', v_success_count,
        'remaining_unplaced_products', v_unplaced_count,
        'insufficient_capacity', v_unplaced_count > 0
    );
END;
$$;
