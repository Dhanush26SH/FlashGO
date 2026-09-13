const fs = require('fs');
const funcs = JSON.parse(fs.readFileSync('extracted_funcs.json', 'utf8'));
let sql = '-- Migration: 20260916000039_order_rpc_events.sql\n-- Description: Wrap authoritative RPCs to emit order_events and capture snapshots.\n\n';

function insertEvent(code, triggerRegExp, eventType, previousStatusExpr, newStatusExpr, description, actorIdExpr = 'auth.uid()', actorRoleExpr = 'NULL', metadataExpr = '\'{}\'::jsonb') {
    let match = triggerRegExp.exec(code);
    if (match) {
        let orderIdVar = 'p_order_id';
        if (code.includes('v_order_id')) orderIdVar = 'v_order_id';
        if (code.includes('v_order.id')) orderIdVar = 'v_order.id';
        if (code.includes('p_trip_id') && code.includes('v_trip.order_id')) orderIdVar = 'v_trip.order_id';

        let insertStmt = `
        INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
        VALUES (${orderIdVar}, ${actorIdExpr}, ${actorRoleExpr}, '${eventType}', ${previousStatusExpr}, ${newStatusExpr}, '${description}', ${metadataExpr}, NULL);
        `;
        // Replace the matched line with itself PLUS the insert statement
        return code.replace(triggerRegExp, match[0] + '\n' + insertStmt);
    }
    return code;
}

// Helper to manually replace string in process_checkout
let pc = funcs['process_checkout'];
pc = pc.replace(
    /INSERT INTO public\.orders \([\s\S]*?\) RETURNING id INTO v_order_id;/g,
    `
    -- Fetch customer snapshot
    DECLARE
        v_customer RECORD;
        v_address RECORD;
        v_warehouse RECORD;
    BEGIN
        SELECT full_name, phone, email INTO v_customer FROM public.profiles WHERE id = p_user_id;
        SELECT name INTO v_warehouse FROM public.warehouses WHERE id = v_warehouse_id;
        
        -- Try to find matching address components
        SELECT * INTO v_address FROM public.customer_addresses 
        WHERE customer_id = p_user_id AND (lat = p_lat AND lng = p_lng OR address_line = p_address) LIMIT 1;
        
        INSERT INTO public.orders (
            customer_id, 
            customer_snapshot_name,
            customer_snapshot_phone,
            customer_snapshot_email,
            warehouse_name_snapshot,
            address_snapshot_formatted,
            address_snapshot_flat,
            address_snapshot_floor,
            address_snapshot_landmark,
            total_amount, 
            subtotal_amount,
            delivery_fee, 
            discount_amount,
            coupon_code, 
            delivery_address, 
            delivery_lat, 
            delivery_lng, 
            status,
            warehouse_id,
            payment_method,
            payment_status
        )
        VALUES (
            p_user_id, 
            v_customer.full_name,
            v_customer.phone,
            v_customer.email,
            v_warehouse.name,
            p_address,
            v_address.flat_house_no,
            v_address.floor,
            v_address.landmark,
            v_total_amount, 
            v_subtotal,
            v_real_delivery_fee, 
            v_real_discount_val,
            p_coupon_code, 
            p_address, 
            p_lat, 
            p_lng, 
            'placed',
            v_warehouse_id,
            p_payment_method,
            v_final_payment_status
        )
        RETURNING id INTO v_order_id;
        
        INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
        VALUES (v_order_id, p_user_id, 'customer', 'order_placed', NULL, 'placed', 'Order placed by customer', jsonb_build_object('payment_method', p_payment_method), 'checkout_evt_' || v_order_id);
    END;
    `
);

pc = pc.replace(
    /INSERT INTO public\.order_items \(order_id, product_id, quantity, price, status\)\s*VALUES \(v_order_id, v_item\."productId", v_item\.quantity, v_item_price, 'pending'\);/g,
    `INSERT INTO public.order_items (order_id, product_id, quantity, price, status, product_name_snapshot, product_image_snapshot, sku_snapshot, manufacturer_barcode_snapshot)
        VALUES (v_order_id, v_item."productId", v_item.quantity, v_item_price, 'pending', v_product.name, v_product.image_url, v_product.sku, v_product.manufacturer_barcode);`
);

sql += pc + '\n\n';

let f = funcs['complete_picking'];
f = insertEvent(f, /UPDATE public\.orders[\s\S]*?WHERE id = p_order_id;/g, 'picking_completed', "'picking'", "'waiting_for_packing'", 'Picker completed picking phase', 'p_picker_id');
sql += f + '\n\n';

f = funcs['start_packing_order'];
f = insertEvent(f, /UPDATE public\.orders SET status = 'packing'[\s\S]*?WHERE id = p_order_id;/g, 'packing_started', "'waiting_for_packing'", "'packing'", 'Packing started', 'p_packer_id');
sql += f + '\n\n';

f = funcs['pack_order'];
f = insertEvent(f, /UPDATE public\.orders[\s\S]*?WHERE id = p_order_id;/g, 'packing_completed', "'packing'", "'packed'", 'Packing completed', 'p_picker_id');
sql += f + '\n\n';

f = funcs['stage_order'];
f = insertEvent(f, /UPDATE public\.orders[\s\S]*?WHERE id = p_order_id;/g, 'staged', "'packed'", "'staged'", 'Order staged for dispatch', 'p_user_id');
sql += f + '\n\n';

f = funcs['handoff_order'];
f = insertEvent(f, /UPDATE public\.orders[\s\S]*?WHERE id = p_order_id;/g, 'handed_off', "'staged'", "'handed_off'", 'Order handed off to driver', 'p_user_id');
sql += f + '\n\n';

f = funcs['admin_cancel_order'];
f = insertEvent(f, /UPDATE public\.orders[\s\S]*?WHERE id = p_order_id;/g, 'cancelled', 'v_status', "'cancelled'", 'Order cancelled by Admin', 'auth.uid()');
sql += f + '\n\n';

f = funcs['driver_mark_arrived'];
f = insertEvent(f, /UPDATE public\.logistics_trips[\s\S]*?WHERE id = p_trip_id;/g, 'driver_arrived', "'out_for_delivery'", "'arrived'", 'Driver arrived at delivery location', 'v_driver_id');
sql += f + '\n\n';

f = funcs['driver_complete_delivery'];
f = insertEvent(f, /UPDATE public\.orders SET status = 'delivered'[\s\S]*?WHERE id = v_order\.id;/g, 'delivered', "'in_transit'", "'delivered'", 'Delivery completed', 'v_driver_id', 'NULL', "jsonb_build_object('cod_collected', p_cod_collected)");
sql += f + '\n\n';

fs.writeFileSync('supabase/migrations/20260916000039_order_rpc_events.sql', sql);
console.log('Saved to 20260916000039_order_rpc_events.sql');
