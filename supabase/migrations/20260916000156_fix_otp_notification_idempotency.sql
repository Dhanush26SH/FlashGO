-- Migration 156: Fix High Value OTP Notification Idempotency
-- Replaces public.handle_generate_high_value_otp to scope the 
-- event_key correctly to the order, and upsert on conflict to
-- guarantee the visible OTP matches the authoritative hash.

CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_otp TEXT;
BEGIN
    -- Only generate OTP when status becomes out_for_delivery so it doesn't expire too early
    IF NEW.total_amount > 1000.00 AND OLD.status != 'out_for_delivery' AND NEW.status = 'out_for_delivery' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        
        -- Authoritative hash (idempotent via ON CONFLICT DO UPDATE)
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, extensions.crypt(v_otp, extensions.gen_salt('bf')), NOW() + INTERVAL '4 hours')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Customer-visible OTP notification
        -- Must use order-scoped event_key and ON CONFLICT DO UPDATE to stay synchronized
        INSERT INTO public.notifications (
            recipient_id, 
            title, 
            message, 
            type, 
            entity_type, 
            entity_id, 
            event_key
        )
        VALUES (
            NEW.customer_id, 
            'Delivery OTP', 
            'Your delivery OTP for order ' || NEW.order_number || ' is ' || v_otp, 
            'DELIVERY_OTP', 
            'order', 
            NEW.id, 
            'otp_generated:' || NEW.id::text
        )
        ON CONFLICT (recipient_id, event_key) DO UPDATE SET 
            title = EXCLUDED.title,
            message = EXCLUDED.message,
            type = EXCLUDED.type,
            entity_type = EXCLUDED.entity_type,
            entity_id = EXCLUDED.entity_id,
            is_read = false,
            created_at = NOW();
    END IF;
    RETURN NEW;
END;
$function$;
