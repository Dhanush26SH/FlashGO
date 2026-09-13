-- 20260916000070_fix_otp_trigger_status.sql
-- Fixes the OTP trigger which was incorrectly expecting orders.status to be 'in_transit' instead of 'out_for_delivery'

CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_otp TEXT;
BEGIN
    -- Only generate OTP when status becomes out_for_delivery so it doesn't expire too early
    IF NEW.total_amount > 1000.00 AND OLD.status != 'out_for_delivery' AND NEW.status = 'out_for_delivery' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, crypt(v_otp, gen_salt('bf')), NOW() + INTERVAL '4 hours')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Insert into notifications table correctly matching schema
        INSERT INTO public.notifications (recipient_id, title, message, type, entity_type, entity_id, event_key)
        VALUES (NEW.customer_id, 'Delivery OTP', 'Your delivery OTP for order ' || NEW.order_number || ' is ' || v_otp, 'DELIVERY_OTP', 'order', NEW.id, 'otp_generated');
    END IF;
    RETURN NEW;
END;
$$;
