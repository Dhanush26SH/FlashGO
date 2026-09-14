-- Migration: 20260916000104_temp_location_audit.sql
-- Description: Temporary READ-ONLY RPC for Location Family Audit

CREATE OR REPLACE FUNCTION public.temp_read_only_location_audit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_warehouse_id UUID;
    v_cr_locations JSONB;
    v_fr_locations JSONB;
    v_fv_locations JSONB;
BEGIN
    -- Udupi FlashGO Store
    SELECT id INTO v_warehouse_id FROM public.warehouses WHERE name ILIKE '%Udupi%' LIMIT 1;

    -- CR Locations
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'warehouse_id', l.warehouse_id,
            'location_code', l.location_code,
            'zone', l.zone,
            'rack', l.rack,
            'shelf_level', l.shelf_level,
            'position', l.position,
            'capacity', l.capacity,
            'is_active', l.is_active,
            'qr_payload', l.barcode,
            'placements', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'location_code', l.location_code,
                    'product_id', p.id,
                    'product_name', p.name,
                    'product_code', p.sku,
                    'internal_barcode', p.internal_barcode,
                    'quantity', wpp.quantity
                ))
                FROM public.warehouse_product_placements wpp
                JOIN public.products p ON p.id = wpp.product_id
                WHERE wpp.location_id = l.id
            ), '[]'::jsonb),
            'used_quantity', COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = l.id), 0),
            'reserved_quantity', COALESCE((
                SELECT SUM(quantity) FROM public.putaway_tasks 
                WHERE destination_location = l.location_code AND status IN ('pending', 'in_progress')
            ), 0)
        )
    ) INTO v_cr_locations
    FROM public.warehouse_locations l
    WHERE l.warehouse_id = v_warehouse_id AND l.location_code LIKE 'D0-CR01-002-%';

    -- FR Locations
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'warehouse_id', l.warehouse_id,
            'location_code', l.location_code,
            'zone', l.zone,
            'rack', l.rack,
            'shelf_level', l.shelf_level,
            'position', l.position,
            'capacity', l.capacity,
            'is_active', l.is_active,
            'qr_payload', l.barcode,
            'placements', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'location_code', l.location_code,
                    'product_id', p.id,
                    'product_name', p.name,
                    'product_code', p.sku,
                    'internal_barcode', p.internal_barcode,
                    'quantity', wpp.quantity
                ))
                FROM public.warehouse_product_placements wpp
                JOIN public.products p ON p.id = wpp.product_id
                WHERE wpp.location_id = l.id
            ), '[]'::jsonb),
            'used_quantity', COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = l.id), 0),
            'reserved_quantity', COALESCE((
                SELECT SUM(quantity) FROM public.putaway_tasks 
                WHERE destination_location = l.location_code AND status IN ('pending', 'in_progress')
            ), 0)
        )
    ) INTO v_fr_locations
    FROM public.warehouse_locations l
    WHERE l.warehouse_id = v_warehouse_id AND l.location_code LIKE 'D0-FR01-001-%';

    -- FV Locations
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'warehouse_id', l.warehouse_id,
            'location_code', l.location_code,
            'zone', l.zone,
            'rack', l.rack,
            'shelf_level', l.shelf_level,
            'position', l.position,
            'capacity', l.capacity,
            'is_active', l.is_active,
            'qr_payload', l.barcode,
            'placements', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'location_code', l.location_code,
                    'product_id', p.id,
                    'product_name', p.name,
                    'product_code', p.sku,
                    'internal_barcode', p.internal_barcode,
                    'quantity', wpp.quantity
                ))
                FROM public.warehouse_product_placements wpp
                JOIN public.products p ON p.id = wpp.product_id
                WHERE wpp.location_id = l.id
            ), '[]'::jsonb),
            'used_quantity', COALESCE((SELECT SUM(quantity) FROM public.warehouse_product_placements WHERE location_id = l.id), 0),
            'reserved_quantity', COALESCE((
                SELECT SUM(quantity) FROM public.putaway_tasks 
                WHERE destination_location = l.location_code AND status IN ('pending', 'in_progress')
            ), 0)
        )
    ) INTO v_fv_locations
    FROM public.warehouse_locations l
    WHERE l.warehouse_id = v_warehouse_id AND l.location_code LIKE 'D0-FV01-001-%';

    RETURN jsonb_build_object(
        'CR', COALESCE(v_cr_locations, '[]'::jsonb),
        'FR', COALESCE(v_fr_locations, '[]'::jsonb),
        'FV', COALESCE(v_fv_locations, '[]'::jsonb)
    );
END;
$$;
