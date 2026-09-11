-- Migration: 20260916000027_notifications_and_final_fixes.sql
-- Description: Fix OTP notification column names to match actual notifications schema.

CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
BEGIN
    -- Only generate OTP when status becomes in_transit so it doesn't expire too early
    IF NEW.total_amount > 1000.00 AND OLD.status != 'in_transit' AND NEW.status = 'in_transit' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, crypt(v_otp, gen_salt('bf')), NOW() + INTERVAL '4 hours')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Insert into notifications table correctly matching schema
        INSERT INTO public.notifications (recipient_id, title, message, type, entity_type, entity_id, event_key)
        VALUES (NEW.customer_id, 'Delivery OTP', 'Your delivery OTP for order ' || NEW.order_number || ' is ' || v_otp, 'DELIVERY_OTP', 'order', NEW.id::text, 'otp_' || NEW.id::text);
    END IF;
    RETURN NEW;
END;
$$;
