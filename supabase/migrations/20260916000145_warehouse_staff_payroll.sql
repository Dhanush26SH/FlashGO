-- Migration: 20260916000145_warehouse_staff_payroll.sql

CREATE TABLE IF NOT EXISTS public.warehouse_staff_salary_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    monthly_base_salary NUMERIC(10,2) NOT NULL CHECK (monthly_base_salary > 0),
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ensure effective_from is always the 1st of the month
    CONSTRAINT effective_from_first_of_month CHECK (EXTRACT(DAY FROM effective_from) = 1)
);
ALTER TABLE public.warehouse_staff_salary_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read salary configs" ON public.warehouse_staff_salary_configs FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);

CREATE TABLE IF NOT EXISTS public.warehouse_staff_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    salary_month DATE NOT NULL,
    salary_config_id UUID NOT NULL REFERENCES public.warehouse_staff_salary_configs(id) ON DELETE RESTRICT,
    base_salary NUMERIC(10,2) NOT NULL CHECK (base_salary >= 0),
    additions NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (additions >= 0),
    deductions NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
    net_salary NUMERIC(10,2) NOT NULL CHECK (net_salary >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    payment_provider TEXT NULL,
    payment_method TEXT NULL,
    payment_reference TEXT NULL,
    provider_payment_id TEXT NULL,
    provider_reference TEXT NULL,
    generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ NULL,
    actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT salary_month_first_of_month CHECK (EXTRACT(DAY FROM salary_month) = 1),
    UNIQUE (staff_id, salary_month)
);
ALTER TABLE public.warehouse_staff_payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payroll" ON public.warehouse_staff_payroll FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);
CREATE POLICY "Staff read own payroll" ON public.warehouse_staff_payroll FOR SELECT TO authenticated USING (
    auth.uid() = staff_id
);

-- Payment Reference Uniqueness
CREATE UNIQUE INDEX idx_unique_warehouse_payment_ref ON public.warehouse_staff_payroll (payment_provider, payment_reference) WHERE payment_reference IS NOT NULL AND payment_provider IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_id UUID NOT NULL REFERENCES public.warehouse_staff_payroll(id) ON DELETE CASCADE,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('addition', 'deduction')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payroll adjustments" ON public.payroll_adjustments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'warehouse_manager'))
);

-- Configure Salary
CREATE OR REPLACE FUNCTION public.configure_warehouse_salary(
    p_staff_id UUID,
    p_monthly_salary NUMERIC,
    p_effective_from DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_active_config RECORD;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_staff_id AND role = 'warehouse_staff') THEN
        RAISE EXCEPTION 'Invalid staff role';
    END IF;

    IF EXTRACT(DAY FROM p_effective_from) != 1 THEN
        RAISE EXCEPTION 'effective_from must be the 1st of the month';
    END IF;

    -- Close active config if exists
    SELECT * INTO v_active_config FROM public.warehouse_staff_salary_configs 
    WHERE staff_id = p_staff_id AND effective_to IS NULL FOR UPDATE;

    IF FOUND THEN
        IF v_active_config.effective_from >= p_effective_from THEN
            RAISE EXCEPTION 'New effective date must be strictly after the current active config effective date';
        END IF;
        -- Close the previous config on the day BEFORE the new one starts
        UPDATE public.warehouse_staff_salary_configs 
        SET effective_to = (p_effective_from - INTERVAL '1 day')::DATE
        WHERE id = v_active_config.id;
    END IF;

    INSERT INTO public.warehouse_staff_salary_configs (staff_id, monthly_base_salary, effective_from, created_by)
    VALUES (p_staff_id, p_monthly_salary, p_effective_from, auth.uid());

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.configure_warehouse_salary(UUID, NUMERIC, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_warehouse_salary(UUID, NUMERIC, DATE) TO authenticated;

-- Generate Payroll
CREATE OR REPLACE FUNCTION public.generate_warehouse_payroll(
    p_warehouse_id UUID,
    p_salary_month DATE,
    p_staff_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_staff_id UUID;
    v_config RECORD;
    v_processed_count INT := 0;
    v_failed_count INT := 0;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF EXTRACT(DAY FROM p_salary_month) != 1 THEN
        RAISE EXCEPTION 'salary_month must be the 1st of the month';
    END IF;

    FOREACH v_staff_id IN ARRAY p_staff_ids LOOP
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_staff_id AND role = 'warehouse_staff' AND warehouse_id = p_warehouse_id) THEN
                RAISE EXCEPTION 'Invalid staff';
            END IF;

            IF EXISTS (SELECT 1 FROM public.warehouse_staff_payroll WHERE staff_id = v_staff_id AND salary_month = p_salary_month) THEN
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;

            -- Find effective config for the salary month
            -- A config is effective if its effective_from <= salary_month AND (effective_to IS NULL OR effective_to >= salary_month)
            SELECT * INTO v_config FROM public.warehouse_staff_salary_configs
            WHERE staff_id = v_staff_id 
              AND effective_from <= p_salary_month
              AND (effective_to IS NULL OR effective_to >= p_salary_month)
            ORDER BY effective_from DESC LIMIT 1 FOR SHARE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No active salary config found for month';
            END IF;

            INSERT INTO public.warehouse_staff_payroll (
                staff_id, salary_month, salary_config_id, base_salary, net_salary, generated_by
            ) VALUES (
                v_staff_id, p_salary_month, v_config.id, v_config.monthly_base_salary, v_config.monthly_base_salary, auth.uid()
            );

            v_processed_count := v_processed_count + 1;
        EXCEPTION
            WHEN OTHERS THEN
                v_failed_count := v_failed_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'processed_count', v_processed_count, 'failed_count', v_failed_count);
END;
$$;
REVOKE ALL ON FUNCTION public.generate_warehouse_payroll(UUID, DATE, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_warehouse_payroll(UUID, DATE, UUID[]) TO authenticated;

-- Add Adjustment
CREATE OR REPLACE FUNCTION public.add_payroll_adjustment(
    p_payroll_id UUID,
    p_type TEXT,
    p_amount NUMERIC,
    p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_payroll RECORD;
    v_additions NUMERIC(10,2);
    v_deductions NUMERIC(10,2);
    v_net NUMERIC(10,2);
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_payroll FROM public.warehouse_staff_payroll WHERE id = p_payroll_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payroll not found'; END IF;
    IF v_payroll.status = 'paid' THEN RAISE EXCEPTION 'Cannot adjust a paid payroll'; END IF;

    INSERT INTO public.payroll_adjustments (payroll_id, adjustment_type, amount, reason, created_by)
    VALUES (p_payroll_id, p_type, p_amount, p_reason);

    SELECT COALESCE(SUM(amount), 0) INTO v_additions FROM public.payroll_adjustments WHERE payroll_id = p_payroll_id AND adjustment_type = 'addition';
    SELECT COALESCE(SUM(amount), 0) INTO v_deductions FROM public.payroll_adjustments WHERE payroll_id = p_payroll_id AND adjustment_type = 'deduction';
    
    v_net := v_payroll.base_salary + v_additions - v_deductions;
    IF v_net < 0 THEN v_net := 0; END IF;

    UPDATE public.warehouse_staff_payroll 
    SET additions = v_additions, deductions = v_deductions, net_salary = v_net 
    WHERE id = p_payroll_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.add_payroll_adjustment(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_payroll_adjustment(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- Mark Paid
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(
    p_payroll_id UUID,
    p_payment_reference TEXT,
    p_payment_method TEXT,
    p_payment_provider TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_role public.user_role;
    v_payroll RECORD;
BEGIN
    SELECT role INTO v_admin_role FROM public.profiles WHERE id = auth.uid();
    IF v_admin_role != 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF trim(p_payment_reference) = '' THEN RAISE EXCEPTION 'Reference required'; END IF;

    SELECT * INTO v_payroll FROM public.warehouse_staff_payroll WHERE id = p_payroll_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payroll not found'; END IF;
    IF v_payroll.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;

    UPDATE public.warehouse_staff_payroll
    SET status = 'paid', payment_reference = trim(p_payment_reference), payment_method = p_payment_method, payment_provider = p_payment_provider, paid_at = now(), actor_id = auth.uid()
    WHERE id = p_payroll_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_payroll_paid(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payroll_paid(UUID, TEXT, TEXT, TEXT) TO authenticated;
