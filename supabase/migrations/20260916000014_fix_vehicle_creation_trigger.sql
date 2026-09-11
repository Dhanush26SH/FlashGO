-- Migration: 20260916000014_fix_vehicle_creation_trigger.sql
-- Description: Update legacy vehicle creation trigger to support driver-owned vehicles without a warehouse

CREATE OR REPLACE FUNCTION validate_vehicle_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Ensure uppercase and trim
    NEW.license_plate := UPPER(TRIM(NEW.license_plate));

    IF NEW.license_plate = '' THEN
        RAISE EXCEPTION 'License plate cannot be empty';
    END IF;
    IF NEW.vehicle_type IS NULL OR NEW.vehicle_type = '' THEN
        RAISE EXCEPTION 'Vehicle type cannot be empty';
    END IF;
    
    -- Ownership-aware warehouse check
    IF NEW.ownership_type IS NULL OR NEW.ownership_type = 'company_owned' THEN
        IF NEW.warehouse_id IS NULL THEN
            RAISE EXCEPTION 'Warehouse ID cannot be empty';
        END IF;
    END IF;

    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status := 'active';
    END IF;

    -- License plate uniqueness is already enforced by the UNIQUE constraint on the table
    RETURN NEW;
END;
$$;
