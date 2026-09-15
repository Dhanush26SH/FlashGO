-- Description: Fix high value OTP schema resolution for pgcrypto functions

-- 1. Fix OTP Generation
CREATE OR REPLACE FUNCTION public.handle_generate_high_value_otp()
RETURNS TRIGGER AS $$
DECLARE
    v_otp TEXT;
BEGIN
    -- Only generate OTP when status becomes out_for_delivery so it doesn't expire too early
    IF NEW.total_amount > 1000.00 AND OLD.status != 'out_for_delivery' AND NEW.status = 'out_for_delivery' THEN
        v_otp := lpad(floor(random() * 1000000)::text, 6, '0');
        INSERT INTO public.order_delivery_otp (order_id, otp_hash, expires_at)
        VALUES (NEW.id, extensions.crypt(v_otp, extensions.gen_salt('bf')), NOW() + INTERVAL '4 hours')
        ON CONFLICT (order_id) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, status = 'pending', attempts = 0;
        
        -- Insert into notifications table correctly matching schema
        INSERT INTO public.notifications (recipient_id, title, message, type, entity_type, entity_id, event_key)
        VALUES (NEW.customer_id, 'Delivery OTP', 'Your delivery OTP for order ' || NEW.order_number || ' is ' || v_otp, 'DELIVERY_OTP', 'order', NEW.id, 'otp_generated');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix OTP Verification
CREATE OR REPLACE FUNCTION public.driver_verify_delivery_otp(p_order_id UUID, p_otp TEXT)
RETURNS jsonb AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_order RECORD;
    v_otp_rec RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL OR v_order.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_ORDER');
    END IF;
    
    SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = p_order_id FOR UPDATE;
    IF v_otp_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_OTP_REQUIRED');
    END IF;
    
    IF v_otp_rec.status = 'verified' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_VERIFIED');
    END IF;
    IF v_otp_rec.status = 'locked' OR v_otp_rec.attempts >= v_otp_rec.max_attempts THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_MANY_ATTEMPTS');
    END IF;
    IF v_otp_rec.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'EXPIRED');
    END IF;
    
    -- Verify Hash (fallback to orders.otp_code if missing from table)
    IF v_otp_rec.otp_hash = extensions.crypt(p_otp, v_otp_rec.otp_hash) OR p_otp = v_order.otp_code THEN
        UPDATE public.order_delivery_otp SET status = 'verified', verified_at = NOW() WHERE id = v_otp_rec.id;
        RETURN jsonb_build_object('success', true);
    ELSE
        UPDATE public.order_delivery_otp SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= max_attempts THEN 'locked' ELSE status END WHERE id = v_otp_rec.id;
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_OTP');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
