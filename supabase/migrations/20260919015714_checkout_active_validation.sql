-- Migration: 20260919015714_checkout_active_validation.sql
-- Fix: get_cart_checkout_quote and process_checkout_v2 must reject inactive products independently

-- 1. get_cart_checkout_quote
CREATE OR REPLACE FUNCTION public.get_cart_checkout_quote(
    p_address_id  UUID,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_user_id              UUID := auth.uid();
    v_address              RECORD;
    v_warehouse_id         UUID;
    v_cart_id              UUID;
    v_item                 RECORD;
    v_product              RECORD;
    v_coupon               RECORD;
    v_unit_price           DECIMAL(12,2);
    v_requested_subtotal   DECIMAL(12,2) := 0;
    v_fulfillable_subtotal DECIMAL(12,2) := 0;
    v_discount_val         DECIMAL(12,2) := 0;
    v_delivery_fee         DECIMAL(12,2) := 0;
    v_base_delivery_fee    DECIMAL(12,2);
    v_free_threshold       DECIMAL(12,2);
    v_sellable             INTEGER;
    v_has_unavailable      BOOLEAN := FALSE;
    v_items_arr            JSONB := '[]'::jsonb;
    v_item_obj             JSONB;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

    -- Load and verify address ownership
    SELECT * INTO v_address
    FROM public.customer_addresses
    WHERE id = p_address_id AND customer_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Address not found or does not belong to customer';
    END IF;

    IF v_address.lat IS NULL OR v_address.lng IS NULL THEN
        RAISE EXCEPTION 'Address is missing coordinates — please re-confirm your location';
    END IF;

    -- Resolve serving warehouse from address coordinates
    v_warehouse_id := public.get_serving_warehouse(v_address.lat::double precision, v_address.lng::double precision);
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Delivery not available at this address';
    END IF;

    -- Get cart
    SELECT id INTO v_cart_id FROM public.carts WHERE customer_id = v_user_id;
    IF v_cart_id IS NULL THEN
        RETURN jsonb_build_object(
            'requested_subtotal', 0,
            'fulfillable_subtotal', 0,
            'discount_amount', 0,
            'delivery_fee', 0,
            'total_payable', 0,
            'has_unavailable', false,
            'warehouse_id', v_warehouse_id,
            'items', '[]'::jsonb
        );
    END IF;

    -- Process each cart item
    FOR v_item IN
        SELECT ci.product_id, ci.quantity
        FROM public.cart_items ci
        WHERE ci.cart_id = v_cart_id
        ORDER BY ci.added_at ASC
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        
        -- SECURE: Reject inactive products instead of relying on frontend
        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'Product % is no longer available', v_product.name;
        END IF;

        v_unit_price := COALESCE(v_product.discount_price, v_product.price);
        v_requested_subtotal := v_requested_subtotal + (v_unit_price * v_item.quantity);

        v_sellable := public.get_sellable_quantity(v_warehouse_id, v_item.product_id);

        v_item_obj := jsonb_build_object(
            'product_id',    v_item.product_id,
            'name',          v_product.name,
            'image_url',     v_product.image_url,
            'requested_qty', v_item.quantity,
            'available_qty', v_sellable,
            'unit_price',    v_unit_price,
            'available',     (v_product.is_active AND v_sellable >= v_item.quantity)
        );
        v_items_arr := v_items_arr || v_item_obj;

        IF v_product.is_active AND v_sellable >= v_item.quantity THEN
            v_fulfillable_subtotal := v_fulfillable_subtotal + (v_unit_price * v_item.quantity);
        ELSE
            v_has_unavailable := TRUE;
        END IF;
    END LOOP;

    -- Coupon validation (against fulfillable subtotal, but displayed against requested)
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon FROM public.coupons
        WHERE code = p_coupon_code AND active = true;

        IF FOUND THEN
            IF (v_coupon.expires_at IS NULL OR v_coupon.expires_at >= NOW())
               AND v_fulfillable_subtotal >= v_coupon.min_order_value THEN
                IF v_coupon.discount_type = 'percentage' THEN
                    v_discount_val := v_fulfillable_subtotal * (v_coupon.discount_value / 100);
                    IF v_coupon.max_discount IS NOT NULL THEN
                        v_discount_val := LEAST(v_discount_val, v_coupon.max_discount);
                    END IF;
                ELSE
                    v_discount_val := v_coupon.discount_value;
                END IF;
                v_discount_val := LEAST(v_discount_val, v_fulfillable_subtotal);
            END IF;
        END IF;
    END IF;

    -- Delivery fee
    SELECT base_delivery_fee, free_delivery_threshold
    INTO v_base_delivery_fee, v_free_threshold
    FROM public.platform_settings WHERE id = 1;

    v_base_delivery_fee := COALESCE(v_base_delivery_fee, 29.00);
    v_free_threshold    := COALESCE(v_free_threshold, 299.00);

    IF v_fulfillable_subtotal >= v_free_threshold THEN
        v_delivery_fee := 0;
    ELSE
        v_delivery_fee := v_base_delivery_fee;
    END IF;

    RETURN jsonb_build_object(
        'requested_subtotal',   v_requested_subtotal,
        'fulfillable_subtotal', v_fulfillable_subtotal,
        'discount_amount',      v_discount_val,
        'delivery_fee',         v_delivery_fee,
        'total_payable',        GREATEST(0, v_fulfillable_subtotal - v_discount_val) + v_delivery_fee,
        'has_unavailable',      v_has_unavailable,
        'warehouse_id',         v_warehouse_id,
        'items',                v_items_arr
    );
END;
$$;


-- 2. process_checkout_v2
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

    -- 4. Customer-scoped idempotency check (return existing order if already processed)
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
        SELECT id INTO v_order_id
        FROM public.orders
        WHERE customer_id = v_user_id
          AND checkout_idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_order_id;
        END IF;
    END IF;

    -- 5. Load and verify address ownership (server-authoritative coordinates)
    SELECT * INTO v_address
    FROM public.customer_addresses
    WHERE id = p_address_id AND customer_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Address not found or does not belong to customer';
    END IF;

    IF v_address.lat IS NULL OR v_address.lng IS NULL THEN
        RAISE EXCEPTION 'Address is missing coordinates — please re-confirm your location';
    END IF;

    -- NEW (From Migration 147): Validate recipient fields exist
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

    -- 8. Lock the permanent cart row to serialize with concurrent mutations
    SELECT * INTO v_cart
    FROM public.carts
    WHERE customer_id = v_user_id
    FOR UPDATE;

    IF v_cart.id IS NULL THEN
        RAISE EXCEPTION 'Cart not found — add items before checking out';
    END IF;

    v_cart_id := v_cart.id;

    -- Check cart is not empty
    IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id) THEN
        RAISE EXCEPTION 'Cart is empty';
    END IF;

    -- 9. Calculate subtotal (pricing loop — no lock needed here, products don't change price mid-transaction)
    FOR v_item IN
        SELECT ci.product_id, ci.quantity
        FROM public.cart_items ci
        WHERE ci.cart_id = v_cart_id
        ORDER BY ci.product_id ASC   -- deterministic order matches stock lock order below
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is unavailable or deactivated', v_item.product_id;
        END IF;

        -- SECURE: Reject inactive products instead of relying on frontend
        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'Product % is no longer available', v_product.name;
        END IF;

        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal   := v_subtotal + (v_item_price * v_item.quantity);
    END LOOP;

    IF v_subtotal <= 0 THEN
        RAISE EXCEPTION 'Cannot process empty order';
    END IF;

    -- 10. Coupon validation
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon FROM public.coupons WHERE code = p_coupon_code AND active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid coupon code: %', p_coupon_code;
        END IF;
        IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
            RAISE EXCEPTION 'Coupon % has expired', p_coupon_code;
        END IF;
        IF v_subtotal < v_coupon.min_order_value THEN
            RAISE EXCEPTION 'Minimum order value for coupon % is %', p_coupon_code, v_coupon.min_order_value;
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_discount_val := v_subtotal * (v_coupon.discount_value / 100);
            IF v_coupon.max_discount IS NOT NULL THEN
                v_discount_val := LEAST(v_discount_val, v_coupon.max_discount);
            END IF;
        ELSE
            v_discount_val := v_coupon.discount_value;
        END IF;

        v_discount_val := LEAST(v_discount_val, v_subtotal);
    END IF;

    -- 11. Delivery fee calculation
    SELECT base_delivery_fee, free_delivery_threshold
    INTO v_base_fee, v_free_threshold
    FROM public.platform_settings WHERE id = 1;

    v_base_fee       := COALESCE(v_base_fee, 29.00);
    v_free_threshold := COALESCE(v_free_threshold, 299.00);

    IF (v_subtotal - v_discount_val) >= v_free_threshold THEN
        v_delivery_fee := 0;
    ELSE
        v_delivery_fee := v_base_fee;
    END IF;

    v_total_amount := GREATEST(0, v_subtotal - v_discount_val) + v_delivery_fee;

    -- 12. Wallet payment: debit before order creation
    IF p_payment_method = 'wallet' THEN
        SELECT wallet_balance INTO v_wallet_balance
        FROM public.profiles WHERE id = v_user_id FOR UPDATE;

        IF v_wallet_balance < v_total_amount THEN
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

    -- 14. Authorize direct DML (internal mutation flag for any trigger guards)
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
            'payment_method',   p_payment_method,
            'cart_revision',    v_cart.revision,
            'warehouse_id',     v_warehouse_id,
            'address_id',       p_address_id
        ),
        COALESCE(p_idempotency_key, 'chk_init_' || v_order_id)
    );

    -- For COD/wallet, also emit order_placed immediately
    IF p_payment_method IN ('cod', 'wallet') THEN
        INSERT INTO public.order_events (
            order_id, actor_id, actor_role, event_type,
            previous_status, new_status, description, metadata, idempotency_key
        )
        VALUES (
            v_order_id, v_user_id, 'customer', 'order_placed',
            NULL, 'placed',
            'Order placed successfully',
            jsonb_build_object('payment_method', p_payment_method),
            'order_placed_' || v_order_id
        );
    END IF;

    -- 17. Create order items + snapshot + LOCK warehouse_stock in deterministic order + reserve
    FOR v_item IN
        SELECT ci.product_id, ci.quantity
        FROM public.cart_items ci
        WHERE ci.cart_id = v_cart_id
        ORDER BY ci.product_id ASC   -- DETERMINISTIC: prevents deadlock with concurrent checkouts
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);

        -- Insert order item with product snapshot
        INSERT INTO public.order_items (
            order_id, product_id, quantity, price, status,
            product_name_snapshot, product_image_snapshot,
            sku_snapshot, manufacturer_barcode_snapshot
        )
        VALUES (
            v_order_id, v_item.product_id, v_item.quantity, v_item_price, 'pending',
            v_product.name, v_product.image_url,
            v_product.sku, v_product.manufacturer_barcode
        );

        -- Lock warehouse_stock row in same deterministic order → no deadlock
        SELECT quantity INTO v_physical
        FROM public.warehouse_stock
        WHERE warehouse_id = v_warehouse_id AND product_id = v_item.product_id
        FOR UPDATE;

        IF v_physical IS NULL THEN
            RAISE EXCEPTION 'No stock record found for product: %', v_product.name;
        END IF;

        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
        FROM public.inventory_reservations
        WHERE warehouse_id = v_warehouse_id
          AND product_id   = v_item.product_id
          AND status       = 'reserved';

        v_sellable := GREATEST(0, v_physical - v_reserved);

        IF v_sellable < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
        END IF;

        -- Reserve stock (inside the lock, safe)
        INSERT INTO public.inventory_reservations (
            warehouse_id, product_id, order_id, quantity, status
        )
        VALUES (v_warehouse_id, v_item.product_id, v_order_id, v_item.quantity, 'reserved');
    END LOOP;

    -- 18. Create pending payment_transaction record for prepaid
    IF p_payment_method IN ('upi', 'card') THEN
        INSERT INTO public.payment_transactions (
            order_id, user_id, amount, payment_method, status,
            transaction_id, idempotency_key
        )
        VALUES (
            v_order_id, v_user_id, v_total_amount, p_payment_method,
            'pending', 'pending_' || v_order_id, p_idempotency_key
        );
    END IF;

    -- 19. Remove purchased items from the active cart immediately
    --     (cart row is still locked — safe to delete)
    DELETE FROM public.cart_items
    WHERE cart_id = v_cart_id
      AND product_id IN (
          SELECT product_id FROM public.order_items WHERE order_id = v_order_id
      );

    -- Bump cart revision after mutation
    UPDATE public.carts
    SET revision   = revision + 1,
        updated_at = now()
    WHERE id = v_cart_id;

    -- 20. If not prepaid (already placed), trigger picker assignment
    IF v_order_status = 'placed' THEN
        BEGIN
            PERFORM public.auto_assign_picker(v_order_id);
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING
                    'Picker auto-assignment failed for COD order %: %',
                    v_order_id,
                    SQLERRM;
        END;
    END IF;

    -- Clear internal mutation flag
    PERFORM set_config('flashgo.internal_mutation', '', true);

    RETURN v_order_id;
END;
$$;
