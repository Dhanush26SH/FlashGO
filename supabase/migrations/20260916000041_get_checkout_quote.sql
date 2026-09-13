-- Create get_checkout_quote RPC to provide authoritative pricing to the frontend without committing an order.

CREATE OR REPLACE FUNCTION public.get_checkout_quote(
    p_items JSONB,
    p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_inventory RECORD;
    v_sub_total DECIMAL(12,2) := 0;
    v_coupon_discount DECIMAL(12,2) := 0;
    v_platform_settings RECORD;
    v_delivery_fee DECIMAL(12,2) := 0;
    v_handling_fee DECIMAL(12,2) := 0; -- Future proofing
    v_total DECIMAL(12,2) := 0;
BEGIN
    SELECT * INTO v_platform_settings FROM public.platform_settings WHERE id = 1;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT) LOOP
        SELECT price INTO v_inventory FROM public.products WHERE id = v_item.product_id;
        IF FOUND THEN
            v_sub_total := v_sub_total + (v_inventory.price * v_item.quantity);
        END IF;
    END LOOP;

    v_total := v_sub_total;

    IF p_coupon_id IS NOT NULL THEN
        SELECT discount_value INTO v_coupon_discount FROM public.coupons WHERE id = p_coupon_id;
        v_total := v_total - COALESCE(v_coupon_discount, 0);
        IF v_total < 0 THEN v_total := 0; END IF;
    END IF;

    IF v_total < v_platform_settings.free_delivery_threshold THEN
        v_delivery_fee := v_platform_settings.base_delivery_fee;
        v_total := v_total + v_delivery_fee;
    END IF;

    RETURN jsonb_build_object(
        'subtotal_amount', v_sub_total,
        'discount_amount', COALESCE(v_coupon_discount, 0),
        'delivery_fee', v_delivery_fee,
        'handling_fee', v_handling_fee,
        'tax_amount', 0.00,
        'total_amount', v_total
    );
END;
$$;
