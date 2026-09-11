-- 1. Vehicles Table
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_plate TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Driver Compliance Table
CREATE TABLE public.driver_compliance (
    driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    dl_expiry DATE,
    insurance_expiry DATE,
    rc_expiry DATE,
    bg_check_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Driver <-> Vehicle Assignment (Authoritative)
ALTER TABLE public.profiles ADD COLUMN current_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- 4. Constraint: One vehicle assigned to one driver max
CREATE UNIQUE INDEX unique_active_vehicle_assignment 
ON public.profiles(current_vehicle_id) 
WHERE current_vehicle_id IS NOT NULL;

-- 5. RPC to safely assign vehicle
CREATE OR REPLACE FUNCTION assign_vehicle(p_driver_id UUID, p_vehicle_id UUID)
RETURNS void AS $$
DECLARE
    v_driver RECORD;
    v_vehicle RECORD;
BEGIN
    -- Check driver
    SELECT * INTO v_driver FROM public.profiles WHERE id = p_driver_id AND role = 'driver';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target is not a valid driver profile';
    END IF;

    -- If unassigning
    IF p_vehicle_id IS NULL THEN
        UPDATE public.profiles SET current_vehicle_id = NULL WHERE id = p_driver_id;
        RETURN;
    END IF;

    -- Check vehicle
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle not found';
    END IF;
    
    IF v_vehicle.status != 'active' THEN
        RAISE EXCEPTION 'Vehicle is not active';
    END IF;

    IF v_driver.warehouse_id != v_vehicle.warehouse_id THEN
        RAISE EXCEPTION 'Driver and vehicle warehouse must match';
    END IF;

    -- Check if vehicle is already assigned
    IF EXISTS (SELECT 1 FROM public.profiles WHERE current_vehicle_id = p_vehicle_id AND id != p_driver_id) THEN
        RAISE EXCEPTION 'Vehicle is already assigned to another driver';
    END IF;

    UPDATE public.profiles SET current_vehicle_id = p_vehicle_id WHERE id = p_driver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Driver Online Guard Trigger
CREATE OR REPLACE FUNCTION check_driver_online_guard() RETURNS TRIGGER AS $$
DECLARE
    v_vehicle RECORD;
    v_compliance RECORD;
BEGIN
    IF NEW.role = 'driver' AND NEW.is_online = true AND (OLD.is_online = false OR OLD.is_online IS NULL) THEN
        -- 1. Must have an assigned vehicle
        IF NEW.current_vehicle_id IS NULL THEN
            RAISE EXCEPTION 'Driver must have an assigned vehicle to go online';
        END IF;

        -- 2. Vehicle must be active and match warehouse
        SELECT * INTO v_vehicle FROM public.vehicles WHERE id = NEW.current_vehicle_id;
        IF v_vehicle IS NULL THEN
            RAISE EXCEPTION 'Assigned vehicle does not exist';
        END IF;
        
        IF v_vehicle.status != 'active' THEN
            RAISE EXCEPTION 'Assigned vehicle must be active';
        END IF;

        IF NEW.warehouse_id IS NULL OR NEW.warehouse_id != v_vehicle.warehouse_id THEN
            RAISE EXCEPTION 'Driver warehouse must match vehicle warehouse to go online';
        END IF;

        -- 3. Compliance must exist, be cleared, and not expired
        IF NOT EXISTS (
            SELECT 1 FROM public.driver_compliance 
            WHERE driver_id = NEW.id 
              AND bg_check_status = 'cleared'
              AND dl_expiry >= CURRENT_DATE 
              AND insurance_expiry >= CURRENT_DATE 
              AND rc_expiry >= CURRENT_DATE
        ) THEN
            RAISE EXCEPTION 'Driver compliance documents are missing, expired, or background check not cleared';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_driver_online_guard
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION check_driver_online_guard();

-- 7. RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_compliance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vehicles" ON public.vehicles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Drivers can view vehicles" ON public.vehicles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'driver')
    );

CREATE POLICY "Admins can manage compliance" ON public.driver_compliance
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Drivers can view own compliance" ON public.driver_compliance
    FOR SELECT USING (
        driver_id = auth.uid()
    );
