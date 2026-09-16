-- Fix Add Adjustment
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

    -- FIX: added auth.uid() to match the 5 target columns
    INSERT INTO public.payroll_adjustments (payroll_id, adjustment_type, amount, reason, created_by)
    VALUES (p_payroll_id, p_type, p_amount, p_reason, auth.uid());

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
