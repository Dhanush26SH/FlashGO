-- Migration: 20260916000013_support_driver_owned_vehicles.sql
-- Description: Supports driver-owned personal vehicles for onboarding and check-in

-- 1. Update public.vehicles Table
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS ownership_type TEXT DEFAULT 'company_owned';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS owner_driver_id UUID REFERENCES public.profiles(id);

-- Relax warehouse_id to be nullable for driver-owned vehicles
ALTER TABLE public.vehicles ALTER COLUMN warehouse_id DROP NOT NULL;

-- Ensure existing are correctly flagged
UPDATE public.vehicles SET ownership_type = 'company_owned' WHERE ownership_type IS NULL;

-- Add strict constraint
ALTER TABLE public.vehicles ADD CONSTRAINT vehicle_ownership_rules CHECK (
    (ownership_type = 'driver_owned' AND owner_driver_id IS NOT NULL AND warehouse_id IS NULL) OR
    (ownership_type = 'company_owned' AND owner_driver_id IS NULL AND warehouse_id IS NOT NULL)
);

-- 2. Update public.driver_compliance
ALTER TABLE public.driver_compliance ADD COLUMN IF NOT EXISTS dl_number TEXT;

-- Ensure expiry dates are nullable for driver-owned testing simplification
ALTER TABLE public.driver_compliance ALTER COLUMN dl_expiry DROP NOT NULL;
ALTER TABLE public.driver_compliance ALTER COLUMN insurance_expiry DROP NOT NULL;
ALTER TABLE public.driver_compliance ALTER COLUMN rc_expiry DROP NOT NULL;

-- 3. Update check_driver_online_guard
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

        -- 2. Vehicle must be active
        SELECT * INTO v_vehicle FROM public.vehicles WHERE id = NEW.current_vehicle_id;
        IF v_vehicle IS NULL THEN
            RAISE EXCEPTION 'Assigned vehicle does not exist';
        END IF;
        
        IF v_vehicle.status != 'active' THEN
            RAISE EXCEPTION 'Assigned vehicle must be active';
        END IF;

        -- Check ownership specific rules
        IF v_vehicle.ownership_type = 'company_owned' THEN
            IF NEW.warehouse_id IS NULL OR NEW.warehouse_id != v_vehicle.warehouse_id THEN
                RAISE EXCEPTION 'Driver warehouse must match vehicle warehouse to go online for company vehicles';
            END IF;
        ELSIF v_vehicle.ownership_type = 'driver_owned' THEN
            IF v_vehicle.owner_driver_id != NEW.id THEN
                RAISE EXCEPTION 'Driver can only go online with their own personal vehicle';
            END IF;
        ELSE
            RAISE EXCEPTION 'Invalid vehicle ownership type';
        END IF;

        -- 3. Compliance must exist, be cleared, and have dl_number
        SELECT * INTO v_compliance FROM public.driver_compliance WHERE driver_id = NEW.id;
        
        IF v_compliance IS NULL THEN
            RAISE EXCEPTION 'Driver compliance record is missing';
        END IF;
        
        IF v_compliance.bg_check_status != 'cleared' THEN
            RAISE EXCEPTION 'Background check must be cleared to go online';
        END IF;
        
        IF v_compliance.dl_number IS NULL OR trim(v_compliance.dl_number) = '' THEN
            RAISE EXCEPTION 'Driving Licence number is required to go online';
        END IF;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. New RPC to submit personal vehicle details
CREATE OR REPLACE FUNCTION submit_driver_vehicle_details(p_vehicle_number TEXT, p_dl_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
    v_normalized_vehicle TEXT;
    v_normalized_dl TEXT;
    v_existing_vehicle_id UUID;
    v_driver_role TEXT;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
    END IF;

    SELECT role INTO v_driver_role FROM public.profiles WHERE id = auth.uid();
    IF v_driver_role != 'driver' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Validation & Normalization
    v_normalized_vehicle := upper(regexp_replace(p_vehicle_number, '\s+|-+', '', 'g'));
    v_normalized_dl := upper(trim(p_dl_number));

    IF v_normalized_vehicle = '' OR v_normalized_dl = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
    END IF;

    -- Update or Insert Compliance for DL
    INSERT INTO public.driver_compliance (driver_id, dl_number, bg_check_status)
    VALUES (auth.uid(), v_normalized_dl, 'pending')
    ON CONFLICT (driver_id) DO UPDATE SET 
        dl_number = EXCLUDED.dl_number;

    -- Find if this driver already has a personal vehicle registered
    SELECT id INTO v_existing_vehicle_id FROM public.vehicles 
    WHERE owner_driver_id = auth.uid() AND ownership_type = 'driver_owned' LIMIT 1;

    IF v_existing_vehicle_id IS NOT NULL THEN
        -- Update existing personal vehicle
        UPDATE public.vehicles 
        SET license_plate = v_normalized_vehicle, 
            status = 'pending'
        WHERE id = v_existing_vehicle_id;
    ELSE
        -- Insert new personal vehicle
        INSERT INTO public.vehicles (license_plate, vehicle_type, ownership_type, owner_driver_id, warehouse_id, status)
        VALUES (v_normalized_vehicle, 'Personal', 'driver_owned', auth.uid(), NULL, 'pending');
    END IF;

    -- We explicitly DO NOT set current_vehicle_id here, Admin must approve it.

    RETURN jsonb_build_object('success', true);
END;
$$;
