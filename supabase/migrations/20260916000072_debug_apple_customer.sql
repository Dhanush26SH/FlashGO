CREATE OR REPLACE FUNCTION public.debug_get_apple_customer_v2()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = '7a6a9d35-fa05-4c30-9a75-476fe8eb6228';
    
    RETURN json_build_object('order', row_to_json(v_order));
END;
$$;
