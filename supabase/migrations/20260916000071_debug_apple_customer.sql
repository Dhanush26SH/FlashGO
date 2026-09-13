CREATE OR REPLACE FUNCTION public.debug_get_apple_customer()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228';
    
    RETURN json_build_object(
        'customer_id', v_order.customer_id,
        'customer_name', v_order.customer_name,
        'customer_phone', v_order.customer_phone,
        'delivery_address', v_order.delivery_address,
        'delivery_lat', v_order.delivery_lat,
        'delivery_lng', v_order.delivery_lng
    );
END;
$$;
