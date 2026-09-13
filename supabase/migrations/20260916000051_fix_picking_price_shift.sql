-- 20260916000051_fix_picking_price_shift.sql

-- 1. Fix price field in get_pick_lines_for_order
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
        SELECT oi.id as order_item_id, oi.product_id, oi.quantity, oi.price,
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
                'price', v_item.price,
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
                'price', v_item.price,
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

-- 2. Fix active shift targeting in pick_fefo_item
CREATE OR REPLACE FUNCTION public.pick_fefo_item(
    p_warehouse_id UUID,
    p_product_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_remaining_qty INTEGER := p_quantity;
    v_batch RECORD;
    v_take_qty INTEGER;
    v_consumed_batches JSONB := '[]'::JSONB;
    v_total_stock INTEGER;
    v_is_suspended BOOLEAN;
    v_reserved_qty INTEGER;
BEGIN
    -- 1. Validate permissions
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_user_id AND role IN ('picker', 'admin', 'warehouse_staff')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User % is not a valid picker/admin', p_user_id;
    END IF;

    SELECT COALESCE(is_suspended, FALSE) INTO v_is_suspended
    FROM public.profiles WHERE id = p_user_id;

    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Picker account % is suspended. Cannot perform picking operations.', p_user_id;
    END IF;

    -- Ensure the picker is actually assigned to the order
    IF NOT EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = p_order_id AND (picker_id = p_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin'))
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to this order';
    END IF;

    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    -- NEW: Ensure we do not pick more than reserved for this order item
    SELECT quantity INTO v_reserved_qty
    FROM public.inventory_reservations
    WHERE order_id = p_order_id AND product_id = p_product_id AND status = 'reserved' FOR UPDATE;

    IF v_reserved_qty IS NULL THEN
        RAISE EXCEPTION 'No active reservation found for this product in the order.';
    END IF;

    IF p_quantity > v_reserved_qty THEN
        RAISE EXCEPTION 'Cannot pick % units. Only % units are reserved/remaining to pick.', p_quantity, v_reserved_qty;
    END IF;

    -- 2. Verify and lock total stock first to prevent concurrent aggregate modification deadlocks
    SELECT quantity INTO v_total_stock 
    FROM public.warehouse_stock 
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id FOR UPDATE;

    IF v_total_stock IS NULL OR v_total_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient total stock in warehouse % for product %', p_warehouse_id, p_product_id;
    END IF;

    -- 3. Lock and iterate through active batches using FEFO
    FOR v_batch IN 
        SELECT id, batch_number, expiry_date, available_quantity 
        FROM public.product_batches
        WHERE warehouse_id = p_warehouse_id 
          AND product_id = p_product_id 
          AND status = 'active'
          AND available_quantity > 0
          AND expiry_date >= CURRENT_DATE
        ORDER BY expiry_date ASC, created_at ASC, id ASC
        FOR UPDATE
    LOOP
        IF v_remaining_qty <= 0 THEN
            EXIT; -- We have fulfilled the pick
        END IF;

        -- Calculate how much to take from this batch
        IF v_batch.available_quantity >= v_remaining_qty THEN
            v_take_qty := v_remaining_qty;
        ELSE
            v_take_qty := v_batch.available_quantity;
        END IF;

        -- Consume from batch
        UPDATE public.product_batches
        SET available_quantity = available_quantity - v_take_qty,
            status = CASE WHEN available_quantity - v_take_qty = 0 THEN 'depleted' ELSE 'active' END
        WHERE id = v_batch.id;

        -- Record ledger (ADDED order_id)
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id, order_id)
        VALUES (p_warehouse_id, p_product_id, -v_take_qty, 'picking', p_user_id, v_batch.id, p_order_id);

        -- Add to return value
        v_consumed_batches := v_consumed_batches || jsonb_build_object(
            'batch_id', v_batch.id,
            'batch_number', v_batch.batch_number,
            'quantity_consumed', v_take_qty,
            'expiry_date', v_batch.expiry_date
        );

        v_remaining_qty := v_remaining_qty - v_take_qty;
    END LOOP;

    IF v_remaining_qty > 0 THEN
        RAISE EXCEPTION 'Insufficient active/unexpired batch stock. Need % more units.', v_remaining_qty;
    END IF;

    -- 4. Update aggregate warehouse stock
    UPDATE public.warehouse_stock
    SET quantity = quantity - p_quantity
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

    -- 5. Mark reservation as consumed
    UPDATE public.inventory_reservations
    SET quantity = quantity - p_quantity,
        status = CASE WHEN quantity - p_quantity <= 0 THEN 'consumed' ELSE 'reserved' END,
        updated_at = now()
    WHERE order_id = p_order_id AND product_id = p_product_id AND status = 'reserved';

    -- 6. Mark order item as picked
    UPDATE public.order_items
    SET picked_quantity = COALESCE(picked_quantity, 0) + p_quantity,
        status = CASE WHEN COALESCE(picked_quantity, 0) + p_quantity >= quantity THEN 'picked' ELSE status END
    WHERE order_id = p_order_id AND product_id = p_product_id;

    -- 7. Update Picker items_picked metric securely
    UPDATE public.staff_shifts
    SET items_picked = items_picked + p_quantity,
        updated_at = now()
    WHERE id = (
        SELECT id FROM public.staff_shifts
        WHERE staff_id = p_user_id 
          AND warehouse_id = p_warehouse_id
          AND status = 'active'
        ORDER BY shift_start DESC
        LIMIT 1
    );

    RETURN v_consumed_batches;
END;
$$ LANGUAGE plpgsql;
