-- Migration: 20260916000004_driver_checkin_tables.sql
-- Description: Create driver_check_in_records table and add staff_shift_id to driver_sessions

CREATE TABLE public.driver_check_in_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    staff_shift_id UUID REFERENCES public.staff_shifts(id) ON DELETE SET NULL,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_lat FLOAT,
    submitted_lng FLOAT,
    calculated_distance_meters FLOAT,
    selfie_storage_path TEXT,
    qr_challenge_id UUID REFERENCES public.warehouse_qr_challenges(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    failure_reason TEXT
);

-- Constraint to prevent double successful check-ins for the same shift
CREATE UNIQUE INDEX idx_driver_check_in_success ON public.driver_check_in_records (driver_id, staff_shift_id) WHERE status = 'SUCCESS';

-- Enable RLS
ALTER TABLE public.driver_check_in_records ENABLE ROW LEVEL SECURITY;

-- Allow drivers to view their own check in records (optional, but good for history)
CREATE POLICY "Drivers can view their own check_in_records"
    ON public.driver_check_in_records
    FOR SELECT
    USING (auth.uid() = driver_id);

-- Admins can view all check in records
CREATE POLICY "Admins can view all check_in_records"
    ON public.driver_check_in_records
    FOR SELECT
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- Add staff_shift_id to driver_sessions
ALTER TABLE public.driver_sessions ADD COLUMN staff_shift_id UUID REFERENCES public.staff_shifts(id) ON DELETE SET NULL;

-- Ensure only one active session per driver
CREATE UNIQUE INDEX idx_driver_sessions_active ON public.driver_sessions (driver_id) WHERE status = 'active';
