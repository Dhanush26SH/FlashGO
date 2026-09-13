-- Migration: 20260916000031_picker_integration.sql
-- Description: RPCs for Picker integration and FEFO location updates

-- 1. Get Pick Lines for Order
CREATE OR REPLACE FUNCTION public.get_pick_lines_for_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
        SELECT oi.id as order_item_id, oi.product_id, oi.quantity,
               p.name as product_name, p.image_url, p.barcode as product_barcode, p.sku
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
                'product_barcode', v_item.product_barcode,
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
                'product_barcode', v_item.product_barcode,
                'sku', v_item.sku,
                'allocated_quantity', v_qty_needed,
                'location_code', 'UNAVAILABLE',
                'stock_issue', true
            );
        END IF;
    END LOOP;

    RETURN v_lines;
END;
$$;


-- 2. Update pick_fefo_item to handle physical location
CREATE OR REPLACE FUNCTION public.pick_fefo_location_item(
    p_warehouse_id UUID, 
    p_product_id UUID, 
    p_location_id UUID, 
    p_quantity INTEGER, 
    p_order_id UUID, 
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_placement RECORD;
BEGIN
    IF p_location_id IS NOT NULL THEN
        -- Verify and lock placement
        SELECT * INTO v_placement FROM public.warehouse_product_placements 
        WHERE location_id = p_location_id AND product_id = p_product_id AND warehouse_id = p_warehouse_id
        FOR UPDATE;

        IF v_placement IS NULL OR v_placement.quantity < p_quantity THEN
            RAISE EXCEPTION 'Insufficient stock in physical location.';
        END IF;

        -- Deduct from placement
        UPDATE public.warehouse_product_placements 
        SET quantity = quantity - p_quantity
        WHERE id = v_placement.id;

        -- Write history
        INSERT INTO public.warehouse_placement_events (warehouse_id, product_id, from_location_id, quantity, event_type, source, actor_id)
        VALUES (p_warehouse_id, p_product_id, p_location_id, p_quantity, 'pick', 'picker_app', p_user_id);
    END IF;

    -- Call existing logic to handle warehouse_stock, batches, ledgers, and order item status
    PERFORM public.pick_fefo_item(p_warehouse_id, p_product_id, p_quantity, p_order_id, p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$;
