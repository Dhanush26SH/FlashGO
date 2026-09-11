-- 20260911000000_driver_onboarding.sql

-- Phase 20: Fresh Driver Verification Flow

-- 1. Create Driver Onboarding Application Table
CREATE TABLE public.driver_onboarding (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, ready_to_submit, submitted, under_review, changes_requested, approved, rejected
    location_permission_granted BOOLEAN DEFAULT false,
    notification_permission_granted BOOLEAN DEFAULT false,
    language_pref TEXT,
    vehicle_type TEXT,
    work_area TEXT,
    work_type TEXT,
    warehouse_id UUID REFERENCES public.warehouses(id),
    selfie_url TEXT,
    fee_paid BOOLEAN DEFAULT false,
    rejection_reason TEXT,
    submission_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Protect driver_onboarding table
ALTER TABLE public.driver_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own onboarding"
    ON public.driver_onboarding FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Drivers can update their own onboarding"
    ON public.driver_onboarding FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Drivers can insert their own onboarding"
    ON public.driver_onboarding FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all onboardings"
    ON public.driver_onboarding FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 2. Create Driver Payout Details (Sensitive)
CREATE TABLE public.driver_payout_details (
    driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    payout_method_type TEXT NOT NULL, -- 'upi' or 'bank'
    upi_id TEXT,
    bank_name TEXT,
    account_holder TEXT,
    account_number TEXT,
    ifsc TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.driver_payout_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own payout details"
    ON public.driver_payout_details FOR SELECT
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert/update own payout details"
    ON public.driver_payout_details FOR ALL
    USING (auth.uid() = driver_id);

CREATE POLICY "Admins can view all payout details"
    ON public.driver_payout_details FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 3. Create Driver Nominee Details (Sensitive)
CREATE TABLE public.driver_nominee_details (
    driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    nominee_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    dob DATE NOT NULL,
    mobile TEXT NOT NULL,
    emergency_mobile TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.driver_nominee_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own nominee details"
    ON public.driver_nominee_details FOR SELECT
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert/update own nominee details"
    ON public.driver_nominee_details FOR ALL
    USING (auth.uid() = driver_id);

CREATE POLICY "Admins can view all nominee details"
    ON public.driver_nominee_details FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 4. Create Terms Agreement Table
CREATE TABLE public.driver_agreement_acceptances (
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    agreement_version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (driver_id, agreement_version)
);

ALTER TABLE public.driver_agreement_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own agreements"
    ON public.driver_agreement_acceptances FOR SELECT
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own agreements"
    ON public.driver_agreement_acceptances FOR INSERT
    WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Admins can view all agreements"
    ON public.driver_agreement_acceptances FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 5. Create Training Modules
CREATE TABLE public.driver_training_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    content_reference TEXT, -- URL or text reference. No fake videos.
    is_required BOOLEAN DEFAULT true,
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.driver_training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active training modules"
    ON public.driver_training_modules FOR SELECT
    USING (is_active = true);

-- Seed real FlashGO Training Modules
INSERT INTO public.driver_training_modules (title, description, content_reference, display_order) VALUES
('How Driver Assignments Work', 'Understand how FlashGO system assigns orders to you efficiently.', 'content:assignment_basics', 1),
('Warehouse Handover Process', 'Learn the standard operating procedure for picking up orders at the dark store.', 'content:handover_sop', 2),
('Starting a Delivery', 'Steps to take right after leaving the warehouse with the order.', 'content:start_delivery', 3),
('Navigation & Location Tracking', 'How to use the in-app navigation and ensure accurate tracking.', 'content:navigation_tips', 4),
('COD Handling', 'Proper procedures for Cash on Delivery orders.', 'content:cod_handling', 5),
('Delivery OTP Verification', 'Mandatory verification steps when handing over the package to the customer.', 'content:otp_verification', 6),
('Failed / Cancelled Delivery Handling', 'What to do when the customer is unavailable or cancels.', 'content:failed_delivery', 7),
('Basic Delivery Safety', 'Important traffic rules and safety precautions.', 'content:safety_basics', 8);

-- 6. Create Training Progress
CREATE TABLE public.driver_training_progress (
    driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    module_id UUID REFERENCES public.driver_training_modules(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (driver_id, module_id)
);

ALTER TABLE public.driver_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own training progress"
    ON public.driver_training_progress FOR SELECT
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own training progress"
    ON public.driver_training_progress FOR INSERT
    WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Admins can view all training progress"
    ON public.driver_training_progress FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 7. Private Storage Bucket for Selfies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver_documents', 'driver_documents', false, 5242880, '{image/jpeg,image/png,image/webp}')
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Drivers can upload own documents"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'driver_documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Drivers can view own documents"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'driver_documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all documents"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'driver_documents' AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- 8. Protect Generic staff approval from bypassing Driver verification
CREATE OR REPLACE FUNCTION public.approve_staff_role(
    p_user_id UUID, 
    p_role public.user_role, 
    p_clean_name TEXT,
    p_warehouse_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_existing_emp_id TEXT;
    v_target RECORD;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot approve self';
    END IF;

    -- Block Driver approval through generic path
    IF p_role = 'driver' THEN
        RAISE EXCEPTION 'Driver approval must use dedicated driver verification flow. Use approve_driver_application instead.';
    END IF;

    IF p_role NOT IN ('picker', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid role for generic staff approval';
    END IF;

    IF p_warehouse_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive warehouse selected';
        END IF;
    END IF;

    SELECT role, employee_id INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;

    v_existing_emp_id := v_target.employee_id;

    IF v_existing_emp_id IS NULL THEN
        v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq');
    END IF;

    UPDATE public.profiles 
    SET role = p_role, 
        full_name = p_clean_name,
        employee_id = v_existing_emp_id,
        is_pending_staff = FALSE,
        requested_role = NULL,
        warehouse_id = p_warehouse_id
    WHERE id = p_user_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_APPROVED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('role', v_target.role),
        jsonb_build_object('role', p_role, 'warehouse_id', p_warehouse_id, 'employee_id', v_existing_emp_id), NULL
    );
END;
$$;

-- 9. Create Secure Driver Approval RPC
CREATE OR REPLACE FUNCTION public.approve_driver_application(
    p_driver_id UUID,
    p_action TEXT, -- 'approve', 'request_changes', 'reject'
    p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_onboarding RECORD;
    v_profile RECORD;
    v_existing_emp_id TEXT;
    v_required_trainings INTEGER;
    v_completed_trainings INTEGER;
BEGIN
    -- Verify admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_driver_id = auth.uid() THEN
        RAISE EXCEPTION 'Cannot approve self';
    END IF;

    -- Lock and fetch onboarding record
    SELECT * INTO v_onboarding FROM public.driver_onboarding WHERE id = p_driver_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver onboarding application not found';
    END IF;

    -- Lock and fetch profile
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_driver_id FOR UPDATE;

    IF p_action = 'reject' THEN
        UPDATE public.driver_onboarding SET status = 'rejected', rejection_reason = p_reason WHERE id = p_driver_id;
        RETURN;
    END IF;

    IF p_action = 'request_changes' THEN
        UPDATE public.driver_onboarding SET status = 'changes_requested', rejection_reason = p_reason WHERE id = p_driver_id;
        RETURN;
    END IF;

    IF p_action = 'approve' THEN
        -- Verify mandatory fields
        IF v_onboarding.vehicle_type IS NULL OR v_onboarding.work_area IS NULL OR v_onboarding.warehouse_id IS NULL OR v_onboarding.selfie_url IS NULL THEN
            RAISE EXCEPTION 'Incomplete onboarding profile data';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = v_onboarding.warehouse_id AND is_active = true) THEN
            RAISE EXCEPTION 'Invalid or inactive warehouse';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_payout_details WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Payout details missing';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_nominee_details WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Nominee details missing';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.driver_agreement_acceptances WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'Terms agreement missing';
        END IF;

        -- Verify training
        SELECT COUNT(*) INTO v_required_trainings FROM public.driver_training_modules WHERE is_active = true AND is_required = true;
        SELECT COUNT(*) INTO v_completed_trainings FROM public.driver_training_progress p JOIN public.driver_training_modules m ON p.module_id = m.id WHERE p.driver_id = p_driver_id AND m.is_active = true AND m.is_required = true;
        
        IF v_completed_trainings < v_required_trainings THEN
            RAISE EXCEPTION 'Mandatory training modules not completed';
        END IF;

        -- Approval logic
        v_existing_emp_id := v_profile.employee_id;
        IF v_existing_emp_id IS NULL THEN
            v_existing_emp_id := 'EMP-' || nextval('public.staff_emp_seq');
        END IF;

        -- Update Profile
        UPDATE public.profiles 
        SET role = 'driver', 
            warehouse_id = v_onboarding.warehouse_id,
            employee_id = v_existing_emp_id,
            is_pending_staff = FALSE,
            requested_role = NULL
        WHERE id = p_driver_id;

        -- Update Onboarding Application
        UPDATE public.driver_onboarding SET status = 'approved', rejection_reason = NULL WHERE id = p_driver_id;

        PERFORM public.write_admin_audit_log(
            'DRIVER_VERIFIED_AND_APPROVED', 'profiles', p_driver_id::text, NULL,
            jsonb_build_object('role', v_profile.role, 'status', v_onboarding.status),
            jsonb_build_object('role', 'driver', 'warehouse_id', v_onboarding.warehouse_id, 'employee_id', v_existing_emp_id, 'status', 'approved'), NULL
        );
    ELSE
        RAISE EXCEPTION 'Invalid action';
    END IF;

END;
$$;
