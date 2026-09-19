import fs from 'fs';

const dump = JSON.parse(fs.readFileSync('scratch/rpc_dump.json', 'utf8'));
const rows = dump.rows;

let sql = `-- Migration: Generic Staff Retirement Lifecycle

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retired_reason TEXT;

CREATE OR REPLACE FUNCTION public.admin_retire_staff(p_target_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF auth.uid() = p_target_id THEN
        RAISE EXCEPTION 'Cannot retire yourself';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid operational staff member';
    END IF;

    -- 1. Picker / Orders
    IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking', 'waiting_for_packing', 'packing', 'staged', 'handed_off')) THEN
        RAISE EXCEPTION 'Cannot retire: Worker has active unfinished orders';
    END IF;

    -- 2. Driver Trips
    IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
        RAISE EXCEPTION 'Cannot retire: Driver has active trips';
    END IF;

    -- 3. Shifts
    IF EXISTS (SELECT 1 FROM public.staff_shifts WHERE staff_id = p_target_id AND status IN ('scheduled', 'booked', 'active', 'present')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has scheduled or active shifts';
    END IF;

    -- 4. Putaway Tasks
    IF EXISTS (SELECT 1 FROM public.putaway_tasks WHERE worker_id = p_target_id AND status IN ('pending', 'in_progress')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has active putaway tasks';
    END IF;

    -- 5. Cycle Counts
    IF EXISTS (SELECT 1 FROM public.cycle_counts WHERE counter_id = p_target_id AND status IN ('open', 'counting', 'submitted')) THEN
        RAISE EXCEPTION 'Cannot retire: Staff has active cycle counts';
    END IF;

    -- 6. COD Liability
    IF EXISTS (SELECT 1 FROM public.cod_collections WHERE driver_id = p_target_id AND status = 'pending') OR 
       (SELECT cod_wallet_liability FROM public.profiles WHERE id = p_target_id) > 0 THEN
        RAISE EXCEPTION 'Cannot retire: Driver has pending COD liability';
    END IF;

    -- 7. Driver Sessions
    IF EXISTS (SELECT 1 FROM public.driver_sessions WHERE driver_id = p_target_id AND status = 'delivering') THEN
        RAISE EXCEPTION 'Cannot retire: Driver has an active delivery session';
    END IF;

    -- Atomic State Cleanup
    UPDATE public.profiles
    SET 
        is_retired = true,
        is_online = false,
        warehouse_is_online = false,
        is_suspended = false,
        suspended_at = NULL,
        suspension_reason = NULL,
        retired_at = NOW(),
        retired_reason = p_reason
    WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_RETIRED', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('reason', p_reason), NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_staff(p_target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid operational staff member';
    END IF;

    UPDATE public.profiles
    SET 
        is_retired = false,
        is_suspended = true, 
        suspension_reason = 'Pending re-onboarding review following restoration from retirement',
        suspended_at = NOW()
    WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_RESTORED_FROM_RETIREMENT', 'profiles', p_target_id::text, NULL,
        NULL, jsonb_build_object('status', 'suspended_pending_review'), NULL
    );

    RETURN TRUE;
END;
$$;

`;

for (const row of rows) {
    let def = row.def;
    
    // Add semicolon if missing at end of definition
    if (!def.trim().endsWith(';')) {
        def = def.trim() + ';';
    }

    if (row.proname === 'admin_assign_active_shift_duty') {
        def = def.replace(
            /IF v_worker IS NULL OR v_worker.role != 'warehouse_staff' THEN/g,
            `IF v_worker.is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    IF v_worker IS NULL OR v_worker.role != 'warehouse_staff' THEN`
        );
    } 
    else if (row.proname === 'admin_assign_picker') {
        def = def.replace(
            /DECLARE\r\n    v_role TEXT;\r\n    v_old_status TEXT;/g,
            `DECLARE\r\n    v_role TEXT;\r\n    v_old_status TEXT;\r\n    v_picker_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT status INTO v_old_status FROM public.orders WHERE id = p_order_id FOR UPDATE;/g,
            `SELECT is_retired INTO v_picker_retired FROM public.profiles WHERE id = p_picker_id;\n    IF v_picker_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    SELECT status INTO v_old_status FROM public.orders WHERE id = p_order_id FOR UPDATE;`
        );
    }
    else if (row.proname === 'driver_book_gigs') {
        def = def.replace(
            /IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN/g,
            `IF v_profile.is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    IF v_profile IS NULL OR v_profile.is_suspended = true OR v_profile.role::text != 'driver' THEN`
        );
    }
    else if (row.proname === 'driver_cod_settlement') {
        def = def.replace(
            /DECLARE\r\n    v_liability DECIMAL;/g,
            `DECLARE\r\n    v_liability DECIMAL;\r\n    v_is_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT cod_wallet_liability INTO v_liability FROM public.profiles WHERE id = p_driver_id FOR UPDATE;/g,
            `SELECT cod_wallet_liability, is_retired INTO v_liability, v_is_retired FROM public.profiles WHERE id = p_driver_id FOR UPDATE;\n\n    IF v_is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;`
        );
    }
    else if (row.proname === 'driver_shift_check_in') {
        def = def.replace(
            /v_driver_suspended BOOLEAN;/g,
            `v_driver_suspended BOOLEAN;\n    v_driver_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT role, is_suspended INTO v_driver_role, v_driver_suspended\n    FROM public.profiles WHERE id = auth.uid\(\);/g,
            `SELECT role, is_suspended, is_retired INTO v_driver_role, v_driver_suspended, v_driver_retired\n    FROM public.profiles WHERE id = auth.uid();\n\n    IF v_driver_retired = true THEN\n        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_RETIRED');\n    END IF;`
        );
    }
    else if (row.proname === 'driver_toggle_break_status') {
        def = def.replace(
            /v_driver_suspended BOOLEAN;/g,
            `v_driver_suspended BOOLEAN;\n    v_driver_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT role, is_suspended INTO v_driver_role, v_driver_suspended\n    FROM public.profiles WHERE id = auth.uid\(\);/g,
            `SELECT role, is_suspended, is_retired INTO v_driver_role, v_driver_suspended, v_driver_retired\n    FROM public.profiles WHERE id = auth.uid();\n\n    IF v_driver_retired = true THEN\n        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_RETIRED');\n    END IF;`
        );
    }
    else if (row.proname === 'picker_shift_check_in') {
        def = def.replace(
            /IF v_profile IS NULL OR v_profile.is_suspended = true THEN/g,
            `IF v_profile.is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    IF v_profile IS NULL OR v_profile.is_suspended = true THEN`
        );
    }
    else if (row.proname === 'picker_toggle_online') {
        def = def.replace(
            /v_role TEXT;/g,
            `v_role TEXT;\n    v_is_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT role INTO v_role\n    FROM public.profiles WHERE id = auth.uid\(\);/g,
            `SELECT role, is_retired INTO v_role, v_is_retired\n    FROM public.profiles WHERE id = auth.uid();\n\n    IF v_is_retired = true THEN\n        RETURN jsonb_build_object('success', false, 'code', 'WORKER_RETIRED');\n    END IF;`
        );
    }
    else if (row.proname === 'start_picking') {
        def = def.replace(
            /v_is_suspended BOOLEAN;/g,
            `v_is_suspended BOOLEAN;\n    v_is_retired BOOLEAN;`
        );
        def = def.replace(
            /SELECT warehouse_id, COALESCE\(is_suspended, FALSE\) INTO v_picker_warehouse_id, v_is_suspended/g,
            `SELECT warehouse_id, COALESCE(is_suspended, FALSE), COALESCE(is_retired, FALSE) INTO v_picker_warehouse_id, v_is_suspended, v_is_retired`
        );
        def = def.replace(
            /IF v_is_suspended = TRUE THEN/g,
            `IF v_is_retired = TRUE THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    IF v_is_suspended = TRUE THEN`
        );
    }
    else if (row.proname === 'warehouse_staff_set_duty') {
        def = def.replace(
            /IF NOT FOUND THEN/g,
            `IF v_profile.is_retired = true THEN\n        RETURN jsonb_build_object('status', 'error', 'message', 'WORKER_RETIRED');\n    END IF;\n\n    IF NOT FOUND THEN`
        );
    }
    else if (row.proname === 'warehouse_staff_shift_check_in') {
        def = def.replace(
            /IF v_profile IS NULL OR v_profile.is_suspended = true THEN/g,
            `IF v_profile.is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    IF v_profile IS NULL OR v_profile.is_suspended = true THEN`
        );
    }
    else if (row.proname === 'warehouse_staff_toggle_online') {
        def = def.replace(
            /IF NOT FOUND THEN/g,
            `IF v_profile.is_retired = true THEN\n        RAISE EXCEPTION 'WORKER_RETIRED';\n    END IF;\n\n    IF NOT FOUND THEN`
        );
    }
    else if (row.proname === 'staff_start_return_intake') {
        if (def.includes('v_staff_role TEXT;')) {
            def = def.replace(
                /v_staff_role TEXT;/g,
                `v_staff_role TEXT;\n    v_is_retired BOOLEAN;`
            );
            def = def.replace(
                /SELECT role INTO v_staff_role FROM public.profiles WHERE id = v_staff_id;/g,
                `SELECT role, COALESCE(is_retired, false) INTO v_staff_role, v_is_retired FROM public.profiles WHERE id = v_staff_id;\n    IF v_is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;`
            );
        } else {
             def = def.replace(
                /v_warehouse_id UUID;/g,
                `v_warehouse_id UUID;\n    v_is_retired BOOLEAN;`
             );
             def = def.replace(
                /SELECT warehouse_id INTO v_warehouse_id/g,
                `SELECT is_retired INTO v_is_retired FROM public.profiles WHERE id = v_staff_id;\n    IF v_is_retired = true THEN\n        RAISE EXCEPTION 'Worker is retired';\n    END IF;\n\n    SELECT warehouse_id INTO v_warehouse_id`
             );
        }
    }

    sql += def + '\n\n';
}

fs.writeFileSync('supabase/migrations/20260919072801_generic_staff_retirement_lifecycle.sql', sql);
console.log('Migration generated successfully.');
