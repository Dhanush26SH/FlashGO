-- 1. Create driver_pay_configs table
CREATE TABLE IF NOT EXISTS public.driver_pay_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_pay NUMERIC(10,2) NOT NULL CHECK(base_pay >= 0),
    included_distance_km NUMERIC(10,2) NOT NULL CHECK(included_distance_km >= 0),
    extra_per_km_rate NUMERIC(10,2) NOT NULL CHECK(extra_per_km_rate >= 0),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ NULL CHECK (effective_to IS NULL OR effective_to > effective_from),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.driver_pay_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers can view active configs" ON public.driver_pay_configs
    FOR SELECT USING (
        auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('driver', 'admin'))
    );

-- Prevent Updates to historical active configs via Trigger
CREATE OR REPLACE FUNCTION public.prevent_historical_config_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- If the config is already effective, prevent destructive financial edits
    IF OLD.effective_from <= NOW() THEN
        -- Allow updating effective_to or is_active to deprecate it, but not financial values
        IF NEW.base_pay != OLD.base_pay OR NEW.included_distance_km != OLD.included_distance_km OR NEW.extra_per_km_rate != OLD.extra_per_km_rate THEN
            RAISE EXCEPTION 'Cannot edit financial values of an already effective pay configuration.';
        END IF;
    END IF;
    
    -- Prevent overlapping active configs roughly
    IF NEW.is_active = true THEN
        IF EXISTS (
            SELECT 1 FROM public.driver_pay_configs 
            WHERE id != NEW.id 
              AND is_active = true
              AND (
                  (NEW.effective_to IS NULL AND effective_to IS NULL) OR
                  (NEW.effective_to IS NULL AND effective_to > NEW.effective_from) OR
                  (effective_to IS NULL AND NEW.effective_to > effective_from) OR
                  (NEW.effective_from < effective_to AND NEW.effective_to > effective_from)
              )
        ) THEN
            RAISE EXCEPTION 'Overlapping active pay configurations are not allowed.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_config_immutability
BEFORE UPDATE ON public.driver_pay_configs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_historical_config_updates();

CREATE TRIGGER enforce_config_immutability_insert
BEFORE INSERT ON public.driver_pay_configs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_historical_config_updates();

-- Insert initial configuration
INSERT INTO public.driver_pay_configs (base_pay, included_distance_km, extra_per_km_rate, effective_from)
VALUES (30.00, 2.00, 10.00, NOW());

-- 2. Add Snapshot Columns to logistics_trips
ALTER TABLE public.logistics_trips
ADD COLUMN IF NOT EXISTS driver_pay_config_id UUID REFERENCES public.driver_pay_configs(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS driver_base_pay_snapshot NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS driver_included_distance_km_snapshot NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS driver_extra_per_km_rate_snapshot NUMERIC(10,2);


-- 3. Modify claim_trip to atomically write snapshots
CREATE OR REPLACE FUNCTION public.claim_trip(p_trip_id UUID, p_driver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offer_id UUID;
    v_trip_status TEXT;
    v_driver_role TEXT;
    v_is_online BOOLEAN;
    v_is_suspended BOOLEAN;
    v_session_id UUID;
    v_shift_end TIMESTAMPTZ;
    v_config RECORD;
    v_existing_config_id UUID;
BEGIN
    -- Lock driver to serialize assignments
    SELECT role, is_online, COALESCE(is_suspended, FALSE)
    INTO v_driver_role, v_is_online, v_is_suspended
    FROM public.profiles
    WHERE id = p_driver_id
    FOR UPDATE;

    IF v_driver_role != 'driver' THEN
        RAISE EXCEPTION 'User % is not a driver', p_driver_id;
    END IF;
    IF v_is_suspended = TRUE THEN
        RAISE EXCEPTION 'Driver account is suspended';
    END IF;
    IF v_is_online != true THEN
        RAISE EXCEPTION 'Driver is not online';
    END IF;

    -- ACTIVE SESSION & SHIFT CHECK
    SELECT ds.id, ss.shift_end
    INTO v_session_id, v_shift_end
    FROM public.driver_sessions ds
    JOIN public.staff_shifts ss ON ds.staff_shift_id = ss.id
    WHERE ds.driver_id = p_driver_id AND ds.status = 'active' AND ss.status = 'active';

    IF v_session_id IS NULL OR v_shift_end < NOW() THEN
        RAISE EXCEPTION 'No active operational session';
    END IF;

    -- Lock the specific offer
    SELECT id INTO v_offer_id
    FROM public.driver_trip_offers
    WHERE trip_id = p_trip_id AND driver_id = p_driver_id AND status = 'offered' AND expires_at > NOW()
    FOR UPDATE;

    IF v_offer_id IS NULL THEN
        RAISE EXCEPTION 'EXPIRED_OFFER';
    END IF;

    -- Prevent multiple active trips
    IF EXISTS (
        SELECT 1 FROM public.logistics_trips
        WHERE driver_id = p_driver_id AND status IN ('accepted', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'Driver already has an active trip';
    END IF;

    -- Lock trip FOR UPDATE
    SELECT status, driver_pay_config_id INTO v_trip_status, v_existing_config_id
    FROM public.logistics_trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF v_trip_status != 'pending' THEN
        RAISE EXCEPTION 'Trip is already claimed or no longer pending';
    END IF;

    -- Retrieve deterministic Pay Configuration Snapshot (only if not already snapshotted from a retry)
    IF v_existing_config_id IS NULL THEN
        SELECT * INTO v_config
        FROM public.driver_pay_configs
        WHERE effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
          AND is_active = true
        ORDER BY effective_from DESC
        LIMIT 1;

        IF v_config.id IS NULL THEN
            RAISE EXCEPTION 'DRIVER_PAY_CONFIG_UNAVAILABLE';
        END IF;

        -- Update trip with snapshots
        UPDATE public.logistics_trips
        SET driver_id = p_driver_id,
            status = 'accepted',
            updated_at = NOW(),
            driver_pay_config_id = v_config.id,
            driver_base_pay_snapshot = v_config.base_pay,
            driver_included_distance_km_snapshot = v_config.included_distance_km,
            driver_extra_per_km_rate_snapshot = v_config.extra_per_km_rate
        WHERE id = p_trip_id;
    ELSE
        -- Just accept the trip without overwriting the original snapshot
        UPDATE public.logistics_trips
        SET driver_id = p_driver_id,
            status = 'accepted',
            updated_at = NOW()
        WHERE id = p_trip_id;
    END IF;

    -- Mark offer accepted
    UPDATE public.driver_trip_offers
    SET status = 'accepted', responded_at = NOW()
    WHERE id = v_offer_id;

    -- Sync order driver_id
    UPDATE public.orders
    SET driver_id = p_driver_id,
        updated_at = NOW()
    WHERE trip_id = p_trip_id;

    RETURN TRUE;
END;
$$;
