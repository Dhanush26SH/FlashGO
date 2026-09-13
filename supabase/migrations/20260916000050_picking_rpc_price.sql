-- 20260916000050_picking_rpc_price.sql

CREATE OR REPLACE FUNCTION public.get_pick_lines_for_order(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_placement RECORD;
    v_lines JSONB := '[]'::jsonb;
    v_qty_needed INT;
    v_qty_allocated INT;
BEGIN
    SELECT warehouse_id INTO v_order FROM public.orders WHERE id = p_order_id;

    FOR v_item IN 
        SELECT oi.id as order_item_id, oi.product_id, oi.quantity, oi.unit_price,
               p.name as product_name, p.image_url, 
               p.barcode as placeholder_barcode, p.manufacturer_barcode, p.manufacturer_barcode_verified, p.sku
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id AND oi.status != 'out_of_stock'
    LOOP
        -- Subtract already picked quantities using stock_ledgers
        DECLARE
            v_picked INT := 0;
        BEGIN
            SELECT COALESCE(SUM(ABS(quantity_change)), 0) INTO v_picked
            FROM public.stock_ledgers
            WHERE order_id = p_order_id AND product_id = v_item.product_id AND reason = 'picking';
            
            v_qty_needed := v_item.quantity - v_picked;
        END;

        IF v_qty_needed <= 0 THEN
            CONTINUE; -- Already picked
        END IF;

        -- Find placements for this product in the warehouse, ordered by FEFO proxy (placed_at)
        FOR v_placement IN
            SELECT wpp.id as placement_id, wpp.location_id, wpp.quantity as available_qty,
                   wl.location_code, wl.barcode as location_barcode, wl.zone, wl.rack, wl.shelf_level, wl.position
            FROM public.warehouse_product_placements wpp
            JOIN public.warehouse_locations wl ON wl.id = wpp.location_id
            WHERE wpp.warehouse_id = v_order.warehouse_id
              AND wpp.product_id = v_item.product_id
              AND wpp.quantity > 0
            ORDER BY wpp.placed_at ASC
        LOOP
            IF v_qty_needed <= 0 THEN
                EXIT;
            END IF;

            v_qty_allocated := LEAST(v_qty_needed, v_placement.available_qty);
            
            v_lines := v_lines || jsonb_build_object(
                'order_item_id', v_item.order_item_id,
                'product_id', v_item.product_id,
                'product_name', v_item.product_name,
                'image_url', v_item.image_url,
                'unit_price', v_item.unit_price,
                'placeholder_barcode', v_item.placeholder_barcode,
                'manufacturer_barcode', v_item.manufacturer_barcode,
                'manufacturer_barcode_verified', v_item.manufacturer_barcode_verified,
                'sku', v_item.sku,
                'allocated_quantity', v_qty_allocated,
                'placement_id', v_placement.placement_id,
                'location_id', v_placement.location_id,
                'location_code', v_placement.location_code,
                'location_barcode', v_placement.location_barcode,
                'zone', v_placement.zone,
                'rack', v_placement.rack,
                'shelf_level', v_placement.shelf_level,
                'position', v_placement.position
            );

            v_qty_needed := v_qty_needed - v_qty_allocated;
        END LOOP;

        -- If still needed, add a line with no location to flag stock issue
        IF v_qty_needed > 0 THEN
            v_lines := v_lines || jsonb_build_object(
                'order_item_id', v_item.order_item_id,
                'product_id', v_item.product_id,
                'product_name', v_item.product_name,
                'image_url', v_item.image_url,
                'unit_price', v_item.unit_price,
                'placeholder_barcode', v_item.placeholder_barcode,
                'manufacturer_barcode', v_item.manufacturer_barcode,
                'manufacturer_barcode_verified', v_item.manufacturer_barcode_verified,
                'sku', v_item.sku,
                'allocated_quantity', v_qty_needed,
                'location_code', 'UNAVAILABLE',
                'stock_issue', true
            );
        END IF;
    END LOOP;

    RETURN v_lines;
END;
$$ LANGUAGE plpgsql;
