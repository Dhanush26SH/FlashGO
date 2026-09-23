-- 20260922000018_staff_performance_reviews.sql

CREATE TABLE public.staff_performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id),
    staff_role public.user_role NOT NULL,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    star_rating INTEGER NOT NULL CHECK (star_rating >= 1 AND star_rating <= 5),
    performance TEXT NOT NULL CHECK (performance IN ('Good','Average','Poor')),
    work_behaviour TEXT NOT NULL CHECK (work_behaviour IN ('Good','Average','Poor')),
    attendance TEXT NOT NULL CHECK (attendance IN ('Good','Average','Poor')),
    remarks TEXT NULL,
    reviewed_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT period_check CHECK (period_end >= period_start),
    CONSTRAINT exact_period_duplicate_check UNIQUE(staff_id, period_start, period_end)
);

ALTER TABLE public.staff_performance_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Staff can view their own reviews"
    ON public.staff_performance_reviews
    FOR SELECT
    USING (staff_id = auth.uid());

CREATE POLICY "Admins can view all reviews"
    ON public.staff_performance_reviews
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Authoritative RPC for creation
CREATE OR REPLACE FUNCTION public.admin_create_staff_performance_review(
    p_staff_id UUID,
    p_warehouse_id UUID,
    p_period_start DATE,
    p_period_end DATE,
    p_star_rating INTEGER,
    p_performance TEXT,
    p_work_behaviour TEXT,
    p_attendance TEXT,
    p_remarks TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_role public.user_role;
    v_reviewer_id UUID;
    v_trim_remarks TEXT;
BEGIN
    v_reviewer_id := auth.uid();
    
    -- Validate caller is Admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_reviewer_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Caller must be an admin';
    END IF;

    -- Validate target profile exists and get role
    SELECT role INTO v_target_role FROM public.profiles WHERE id = p_staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target staff profile not found';
    END IF;
    
    IF v_target_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target staff role must be picker, driver, or warehouse_staff';
    END IF;

    -- Validate warehouse exists
    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Invalid warehouse ID';
    END IF;

    -- Validate staff is legitimately associated with the warehouse
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND warehouse_id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Staff is not associated with the provided warehouse';
    END IF;

    -- Validate date range
    IF p_period_end < p_period_start THEN
        RAISE EXCEPTION 'period_end must be >= period_start';
    END IF;
    
    -- Validate rating and enums
    IF p_star_rating < 1 OR p_star_rating > 5 THEN
        RAISE EXCEPTION 'star_rating must be between 1 and 5';
    END IF;
    
    IF p_performance NOT IN ('Good', 'Average', 'Poor') THEN
        RAISE EXCEPTION 'Invalid performance value';
    END IF;
    
    IF p_work_behaviour NOT IN ('Good', 'Average', 'Poor') THEN
        RAISE EXCEPTION 'Invalid work_behaviour value';
    END IF;
    
    IF p_attendance NOT IN ('Good', 'Average', 'Poor') THEN
        RAISE EXCEPTION 'Invalid attendance value';
    END IF;

    v_trim_remarks := trim(p_remarks);
    IF v_trim_remarks IS NOT NULL AND length(v_trim_remarks) > 1000 THEN
        RAISE EXCEPTION 'Remarks too long (max 1000 chars)';
    END IF;

    -- Check for exact duplicate period is handled by UNIQUE constraint, but we can do it explicitly for clearer error
    IF EXISTS (
        SELECT 1 FROM public.staff_performance_reviews 
        WHERE staff_id = p_staff_id 
          AND period_start = p_period_start 
          AND period_end = p_period_end
    ) THEN
        RAISE EXCEPTION 'A review for this exact period already exists for this staff member';
    END IF;

    INSERT INTO public.staff_performance_reviews (
        staff_id,
        staff_role,
        warehouse_id,
        period_start,
        period_end,
        star_rating,
        performance,
        work_behaviour,
        attendance,
        remarks,
        reviewed_by
    ) VALUES (
        p_staff_id,
        v_target_role,
        p_warehouse_id,
        p_period_start,
        p_period_end,
        p_star_rating,
        p_performance,
        p_work_behaviour,
        p_attendance,
        v_trim_remarks,
        v_reviewer_id
    );
END;
$$;
