-- Migration: 20260916000147_fix_checkout_recipient_snapshot.sql
-- Description: Fix process_checkout_v2 and driver_get_active_delivery for recipient snapshots.

CREATE OR REPLACE FUNCTION public.process_checkout_v2(
    p_address_id      UUID,
    p_delivery_speed  TEXT,
    p_payment_method  TEXT,
    p_coupon_code     TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_user_id          UUID := auth.uid();
    v_order_id         UUID;
    v_cart             RECORD;
    v_cart_id          UUID;
    v_address          RECORD;
    v_customer         RECORD;
    v_warehouse_id     UUID;
    v_warehouse        RECORD;
    v_item             RECORD;
    v_product          RECORD;
    v_coupon           RECORD;
    v_item_price       DECIMAL(12,2);
    v_subtotal         DECIMAL(12,2) := 0;
    v_discount_val     DECIMAL(12,2) := 0;
    v_delivery_fee     DECIMAL(12,2) := 0;
    v_total_amount     DECIMAL(12,2) := 0;
    v_base_fee         DECIMAL(12,2);
    v_free_threshold   DECIMAL(12,2);
    v_wallet_balance   DECIMAL(12,2);
    v_payment_status   TEXT := 'pending';
    v_order_status     public.order_status;
    v_physical         INTEGER;
    v_reserved         INTEGER;
    v_sellable         INTEGER;
BEGIN
    -- 1. Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthenticated';
    END IF;

    -- 2. Payment method validation
    IF p_payment_method NOT IN ('cod', 'wallet', 'upi', 'card') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    -- 3. Prepaid requires idempotency key
    IF p_payment_method IN ('upi', 'card') AND (p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '') THEN
        RAISE EXCEPTION 'Idempotency key is required for prepaid checkout';
    END IF;

    -- 4. Customer-scoped idempotency check
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        SELECT id INTO v_order_id
        FROM public.orders
        WHERE customer_id = v_user_id
          AND checkout_idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_order_id;
        END IF;
    END IF;

    -- 5. Load and verify address ownership
    SELECT * INTO v_address
    FROM public.customer_addresses
    WHERE id = p_address_id AND customer_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Address not found or does not belong to customer';
    END IF;

    IF v_address.lat IS NULL OR v_address.lng IS NULL THEN
        RAISE EXCEPTION 'Address is missing coordinates — please re-confirm your location';
    END IF;

    -- NEW: Validate recipient fields exist
    IF v_address.receiver_name IS NULL OR TRIM(v_address.receiver_name) = '' THEN
        RAISE EXCEPTION 'Address is missing receiver name';
    END IF;

    IF v_address.receiver_phone IS NULL OR TRIM(v_address.receiver_phone) = '' THEN
        RAISE EXCEPTION 'Address is missing receiver phone';
    END IF;

    -- 6. Load customer snapshot data (for email fallback)
    SELECT full_name, phone, email INTO v_customer
    FROM public.profiles WHERE id = v_user_id;

    -- 7. Resolve serving warehouse from address coordinates
    v_warehouse_id := public.get_serving_warehouse(
        v_address.lat::double precision,
        v_address.lng::double precision
    );

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Delivery not available at this address';
    END IF;

    SELECT name INTO v_warehouse FROM public.warehouses WHERE id = v_warehouse_id;

    -- 8. Lock the permanent cart row
    SELECT * INTO v_cart
    FROM public.carts
    WHERE customer_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found';
    END IF;
    v_cart_id := v_cart.id;

    -- 9. Calculate initial subtotal
    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart_id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        
        IF NOT FOUND OR v_product.is_active = false THEN
            RAISE EXCEPTION 'Product % is unavailable', v_product.name;
        END IF;

        -- Inventory check
        SELECT physical_count, reserved_count 
        INTO v_physical, v_reserved
        FROM public.inventory
        WHERE product_id = v_item.product_id AND warehouse_id = v_warehouse_id;

        IF NOT FOUND THEN
            v_sellable := 0;
        ELSE
            v_sellable := COALESCE(v_physical, 0) - COALESCE(v_reserved, 0);
        END IF;

        IF v_sellable < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
        END IF;

        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal := v_subtotal + (v_item_price * v_item.quantity);
    END LOOP;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'Cannot process empty order';
    END IF;

    -- 10. Process Coupons
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon FROM public.coupons 
        WHERE code = p_coupon_code AND active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid or expired coupon';
        END IF;

        IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
            RAISE EXCEPTION 'Coupon has expired';
        END IF;

        IF v_subtotal >= COALESCE(v_coupon.min_order_value, 0) THEN
            IF v_coupon.discount_type = 'fixed' THEN
                v_discount_val := LEAST(v_coupon.discount_value, v_subtotal);
            ELSIF v_coupon.discount_type = 'percentage' THEN
                v_discount_val := v_subtotal * (v_coupon.discount_value / 100);
                IF v_coupon.max_discount IS NOT NULL THEN
                    v_discount_val := LEAST(v_discount_val, v_coupon.max_discount);
                END IF;
            END IF;
        END IF;
    END IF;

    -- 11. Calculate Delivery Fee
    v_base_fee := 40.00;
    v_free_threshold := 500.00;
    
    IF v_subtotal >= v_free_threshold THEN
        v_delivery_fee := 0;
    ELSE
        v_delivery_fee := v_base_fee;
    END IF;

    v_total_amount := GREATEST(0, (v_subtotal - v_discount_val) + v_delivery_fee);

    -- 12. Handle Wallet Payment
    IF p_payment_method = 'wallet' THEN
        SELECT wallet_balance INTO v_wallet_balance 
        FROM public.profiles 
        WHERE id = v_user_id;

        IF COALESCE(v_wallet_balance, 0) < v_total_amount THEN
            RAISE EXCEPTION 'Insufficient wallet balance';
        END IF;

        UPDATE public.profiles
        SET wallet_balance = wallet_balance - v_total_amount
        WHERE id = v_user_id;

        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (v_user_id, v_total_amount, 'debit', 'Order Checkout');

        v_payment_status := 'paid';
    END IF;

    -- 13. Determine initial order status
    v_order_status := CASE
        WHEN p_payment_method IN ('upi', 'card') THEN 'payment_pending'::public.order_status
        ELSE 'placed'::public.order_status
    END;

    -- 14. Authorize direct DML
    PERFORM set_config('flashgo.internal_mutation', 'true', true);

    -- 15. Create the order with all snapshots (using address recipient)
    INSERT INTO public.orders (
        customer_id,
        customer_snapshot_name,
        customer_snapshot_phone,
        customer_snapshot_email,
        warehouse_id,
        warehouse_name_snapshot,
        delivery_address,
        delivery_lat,
        delivery_lng,
        address_snapshot_formatted,
        address_snapshot_flat,
        address_snapshot_floor,
        address_snapshot_landmark,
        address_snapshot_locality,
        total_amount,
        subtotal_amount,
        delivery_fee,
        discount_amount,
        coupon_code,
        status,
        payment_method,
        payment_status,
        checkout_idempotency_key
    )
    VALUES (
        v_user_id,
        v_address.receiver_name,      -- SNAPSHOT FIX: Use address receiver name
        v_address.receiver_phone,     -- SNAPSHOT FIX: Use address receiver phone
        v_customer.email,
        v_warehouse_id,
        v_warehouse.name,
        v_address.address_line,
        v_address.lat,
        v_address.lng,
        v_address.address_line,
        v_address.flat_house_no,
        v_address.floor,
        v_address.landmark,
        v_address.locality,
        v_total_amount,
        v_subtotal,
        v_delivery_fee,
        v_discount_val,
        p_coupon_code,
        v_order_status,
        p_payment_method,
        v_payment_status,
        NULLIF(TRIM(COALESCE(p_idempotency_key, '')), '')
    )
    RETURNING id INTO v_order_id;

    -- 16. Emit checkout_initiated event
    INSERT INTO public.order_events (
        order_id, actor_id, actor_role, event_type,
        previous_status, new_status, description, metadata, idempotency_key
    )
    VALUES (
        v_order_id, v_user_id, 'customer', 'checkout_initiated',
        NULL, v_order_status,
        'Customer initiated checkout',
        jsonb_build_object(
            'payment_method', p_payment_method,
            'subtotal', v_subtotal,
            'delivery_fee', v_delivery_fee,
            'discount', v_discount_val,
            'total', v_total_amount
        ),
        COALESCE(p_idempotency_key, public.uuid_generate_v4()::text)
    );

    -- 17. Move items and reserve inventory
    FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart_id LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);

        INSERT INTO public.order_items (
            order_id, product_id, quantity, price,
            product_name_snapshot, product_image_snapshot, sku_snapshot, manufacturer_barcode_snapshot
        )
        VALUES (
            v_order_id, v_item.product_id, v_item.quantity, v_item_price,
            v_product.name, v_product.image_url, v_product.sku, v_product.manufacturer_barcode
        );

        UPDATE public.inventory
        SET reserved_count = COALESCE(reserved_count, 0) + v_item.quantity
        WHERE product_id = v_item.product_id AND warehouse_id = v_warehouse_id;
    END LOOP;

    -- 18. Clear the cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

    -- 19. If not prepaid, move to accepted immediately
    IF v_order_status = 'placed' THEN
        PERFORM public.assign_order_status(v_order_id, 'accepted', v_user_id, 'customer');
    END IF;

    -- Clear internal mutation flag
    PERFORM set_config('flashgo.internal_mutation', '', true);

    RETURN v_order_id;
END;
$$;


-- DRIVER_GET_ACTIVE_DELIVERY FIX
CREATE OR REPLACE FUNCTION public.driver_get_active_delivery()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_role TEXT;
    v_is_online BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_trip RECORD;
    v_result JSONB;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED');
    END IF;

    SELECT role, is_online INTO v_role, v_is_online FROM public.profiles WHERE id = v_driver_id;
    IF v_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED');
    END IF;

    -- Active session check
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = v_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_ACTIVE_SESSION');
    END IF;

    -- Get active trip (accepted or in_transit)
    SELECT lt.id, lt.status, lt.warehouse_id
    INTO v_trip
    FROM public.logistics_trips lt
    WHERE lt.driver_id = v_driver_id AND lt.status IN ('accepted', 'in_transit')
    LIMIT 1;

    IF v_trip.id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'trip', NULL);
    END IF;

    -- Build sanitized result.
    -- Read recipient details strictly from order snapshot (no fallback to mutable profile!)
    SELECT jsonb_build_object(
        'success', true,
        'trip', jsonb_build_object(
            'id', lt.id,
            'status', lt.status
        ),
        'warehouse', jsonb_build_object(
            'id', w.id,
            'name', w.name,
            'address', w.address,
            'latitude', w.lat,
            'longitude', w.lng
        ),
        'order', jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'status', o.status,
            'total_amount', o.total_amount,
            'payment_method', o.payment_method,
            'payment_status', o.payment_status,
            'picker_name', COALESCE(picker.full_name, 'Assigning'),
            'customer_name', COALESCE(o.customer_snapshot_name, o.customer_name_snapshot, cust.full_name),
            'customer_phone', COALESCE(o.customer_snapshot_phone, cust.phone),
            'delivery_address', o.delivery_address,
            'delivery_lat', o.delivery_lat,
            'delivery_lng', o.delivery_lng,
            'picker_ready', (o.status = 'handed_off'),
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', oi.id,
                    'quantity', oi.quantity,
                    'picked_quantity', oi.picked_quantity,
                    'product_name', p.name,
                    'product_image', p.image_url
                ) ORDER BY oi.id)
                FROM public.order_items oi
                JOIN public.products p ON oi.product_id = p.id
                WHERE oi.order_id = o.id
            ),
            'total_item_count', (
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            )
        )
    ) INTO v_result
    FROM public.logistics_trips lt
    JOIN public.warehouses w ON lt.warehouse_id = w.id
    JOIN public.orders o ON o.trip_id = lt.id AND o.status NOT IN ('cancelled')
    JOIN public.profiles cust ON cust.id = o.customer_id
    LEFT JOIN public.profiles picker ON picker.id = o.picker_id
    WHERE lt.id = v_trip.id
    LIMIT 1;

    RETURN COALESCE(v_result, jsonb_build_object('success', true, 'trip', NULL));
END;
$$;
