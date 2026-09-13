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

    -- 6. Load customer snapshot data
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
        SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id AND is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % is unavailable or deactivated', v_item.product_id;
        END IF;
        v_item_price := COALESCE(v_product.discount_price, v_product.price);
        v_subtotal   := v_subtotal + (v_item_price * v_item.quantity);
    END LOOP;

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

    -- 11. Delivery fee
    SELECT base_delivery_fee, free_delivery_threshold
    INTO v_base_fee, v_free_threshold
    FROM public.platform_settings WHERE id = 1;

    v_base_fee       := COALESCE(v_base_fee, 29.00);
    v_free_threshold := COALESCE(v_free_threshold, 299.00);

    v_delivery_fee   := CASE WHEN v_subtotal >= v_free_threshold THEN 0 ELSE v_base_fee END;
    v_total_amount   := GREATEST(0, v_subtotal - v_discount_val) + v_delivery_fee;

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

    -- 15. Create the order with all snapshots
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
        v_customer.full_name,
        v_customer.phone,
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
        'chk_init_' || v_order_id
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
            RAISE EXCEPTION 'Insufficient stock for %: requested %, available %',
                v_product.name, v_item.quantity, v_sellable;
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

    RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_pending_payment(
    p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order   RECORD;
    v_cart_id UUID;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

    -- Lock the order row
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

    -- Verify ownership
    IF v_order.customer_id != v_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Re-check: must still be payment_pending (idempotency guard)
    IF v_order.status != 'payment_pending' THEN
        -- Already finalized (placed, expired, etc.) — NO-OP
        RETURN;
    END IF;

    -- Transition to payment_failed
    UPDATE public.orders
    SET status         = 'payment_failed'::public.order_status,
        payment_status = 'failed',
        updated_at     = now()
    WHERE id = p_order_id;

    -- Release inventory reservations
    UPDATE public.inventory_reservations
    SET status     = 'released',
        updated_at = now()
    WHERE order_id = p_order_id AND status = 'reserved';

    -- Get or create cart for restoration
    INSERT INTO public.carts (customer_id)
    VALUES (v_user_id)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT id INTO v_cart_id
    FROM public.carts
    WHERE customer_id = v_user_id
    FOR UPDATE;

    -- Restore purchased quantities via additive upsert
    -- If the customer added the same product while payment was open → quantities merge
    INSERT INTO public.cart_items (cart_id, product_id, quantity, added_at)
    SELECT v_cart_id, product_id, quantity, now()
    FROM public.order_items
    WHERE order_id = p_order_id
    ON CONFLICT (cart_id, product_id)
    DO UPDATE SET
        quantity   = public.cart_items.quantity + EXCLUDED.quantity,
        updated_at = now();

    -- Bump cart revision after restoration
    UPDATE public.carts
    SET revision   = revision + 1,
        updated_at = now()
    WHERE id = v_cart_id;

    -- Emit event
    INSERT INTO public.order_events (
        order_id, actor_id, actor_role, event_type,
        previous_status, new_status, description, metadata, idempotency_key
    )
    VALUES (
        p_order_id, v_user_id, 'customer', 'payment_failed',
        'payment_pending', 'payment_failed',
        'Customer cancelled payment',
        '{}'::jsonb,
        'pay_fail_' || p_order_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_payment_pending_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_order   RECORD;
    v_cart_id UUID;
    v_count   INTEGER := 0;
BEGIN
    -- Find candidates (no lock yet — just ids)
    FOR v_order IN
        SELECT id, customer_id
        FROM public.orders
        WHERE status     = 'payment_pending'
          AND created_at < now() - interval '30 minutes'
    LOOP
        -- Lock this order row individually
        PERFORM id FROM public.orders WHERE id = v_order.id FOR UPDATE SKIP LOCKED;
        IF NOT FOUND THEN CONTINUE; END IF;  -- another process grabbed it

        -- Re-check still payment_pending after lock
        IF NOT EXISTS (
            SELECT 1 FROM public.orders
            WHERE id = v_order.id AND status = 'payment_pending'
        ) THEN
            CONTINUE;  -- already finalized — NO-OP
        END IF;

        -- Transition to payment_expired
        UPDATE public.orders
        SET status         = 'payment_expired'::public.order_status,
            payment_status = 'expired',
            updated_at     = now()
        WHERE id = v_order.id;

        -- Release reservations
        UPDATE public.inventory_reservations
        SET status     = 'released',
            updated_at = now()
        WHERE order_id = v_order.id AND status = 'reserved';

        -- Restore cart quantities (additive upsert — same pattern as fail_pending_payment)
        INSERT INTO public.carts (customer_id)
        VALUES (v_order.customer_id)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT id INTO v_cart_id
        FROM public.carts
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        INSERT INTO public.cart_items (cart_id, product_id, quantity, added_at)
        SELECT v_cart_id, product_id, quantity, now()
        FROM public.order_items
        WHERE order_id = v_order.id
        ON CONFLICT (cart_id, product_id)
        DO UPDATE SET
            quantity   = public.cart_items.quantity + EXCLUDED.quantity,
            updated_at = now();

        UPDATE public.carts
        SET revision   = revision + 1,
            updated_at = now()
        WHERE id = v_cart_id;

        -- Emit event
        INSERT INTO public.order_events (
            order_id, actor_id, actor_role, event_type,
            previous_status, new_status, description, metadata, idempotency_key
        )
        VALUES (
            v_order.id, NULL, 'system', 'payment_expired',
            'payment_pending', 'payment_expired',
            'Payment window expired (30 minutes)',
            '{}'::jsonb,
            'pay_exp_' || v_order.id
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_external_payment(
    p_order_id        UUID,
    p_transaction_id  TEXT,
    p_amount          DECIMAL,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order                  RECORD;
    v_payment_transaction_id UUID;
BEGIN
    -- 1. Lock the order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- 2. Handle late successful payment on already-terminal order
    --    (expired / failed before Razorpay callback arrived)
    IF v_order.status IN ('payment_expired', 'payment_failed') THEN
        -- Record the provider payment — customer was charged
        INSERT INTO public.payment_transactions (
            order_id, user_id, amount, payment_method, status,
            transaction_id, idempotency_key
        )
        VALUES (
            p_order_id, v_order.customer_id, p_amount,
            v_order.payment_method, 'refund_pending',
            p_transaction_id, p_idempotency_key
        )
        ON CONFLICT (idempotency_key) DO NOTHING;

        -- Emit event for reconciliation
        INSERT INTO public.order_events (
            order_id, actor_id, actor_role, event_type,
            previous_status, new_status, description, metadata, idempotency_key
        )
        VALUES (
            p_order_id, NULL, 'system', 'late_payment_received',
            v_order.status, v_order.status,
            'Razorpay payment received after order was already ' || v_order.status,
            jsonb_build_object(
                'transaction_id', p_transaction_id,
                'amount',         p_amount,
                'order_status',   v_order.status
            ),
            'late_pay_' || p_idempotency_key
        )
        ON CONFLICT (order_id, idempotency_key) DO NOTHING;

        -- Return structured error — edge function must trigger Razorpay refund
        RETURN jsonb_build_object(
            'code',         'ORDER_EXPIRED_LATE_PAYMENT',
            'order_status', v_order.status,
            'refund_due',   true,
            'amount',       p_amount,
            'transaction_id', p_transaction_id
        );
    END IF;

    -- 3. Guard: must be payment_pending for normal happy path
    IF v_order.payment_status != 'pending' THEN
        -- Already paid (idempotent duplicate callback)
        RETURN jsonb_build_object('code', 'ALREADY_PAID');
    END IF;

    -- 4. Guard: correct payment method
    IF v_order.payment_method NOT IN ('upi', 'card') THEN
        RAISE EXCEPTION 'Order payment method does not support external resolution';
    END IF;

    -- 5. Amount validation
    IF p_amount != v_order.total_amount THEN
        RAISE EXCEPTION 'Amount mismatch: expected %, received %', v_order.total_amount, p_amount;
    END IF;

    -- 6. Idempotency
    IF EXISTS (
        SELECT 1 FROM public.payment_transactions WHERE idempotency_key = p_idempotency_key
    ) THEN
        RETURN jsonb_build_object('code', 'ALREADY_PROCESSED');
    END IF;

    -- 7. Record payment
    INSERT INTO public.payment_transactions (
        order_id, user_id, amount, payment_method, status,
        transaction_id, idempotency_key
    )
    VALUES (
        p_order_id, v_order.customer_id, p_amount,
        v_order.payment_method, 'paid',
        p_transaction_id, p_idempotency_key
    )
    RETURNING id INTO v_payment_transaction_id;

    -- 8. Transition order to placed
    UPDATE public.orders
    SET status         = 'placed'::public.order_status,
        payment_status = 'paid',
        updated_at     = now()
    WHERE id = p_order_id;

    -- 9. Loyalty points
    UPDATE public.profiles
    SET loyalty_points = loyalty_points + FLOOR(p_amount / 2)
    WHERE id = v_order.customer_id;

    -- 10. Emit payment_verified + order_placed events
    INSERT INTO public.order_events (
        order_id, actor_id, actor_role, event_type,
        previous_status, new_status, description, metadata, idempotency_key
    )
    VALUES (
        p_order_id, NULL, 'system', 'payment_verified',
        'payment_pending', 'placed',
        'Razorpay payment verified',
        jsonb_build_object('transaction_id', p_transaction_id, 'amount', p_amount),
        'pay_verified_' || p_idempotency_key
    ),
    (
        p_order_id, v_order.customer_id, 'customer', 'order_placed',
        'payment_pending', 'placed',
        'Order placed after payment verification',
        jsonb_build_object('payment_method', v_order.payment_method),
        'order_placed_' || p_order_id
    )
    ON CONFLICT (order_id, idempotency_key) DO NOTHING;

    RETURN jsonb_build_object('code', 'SUCCESS', 'payment_transaction_id', v_payment_transaction_id);
END;
$$;