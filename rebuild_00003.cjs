const fs = require('fs');

const admin_create_po = `
CREATE OR REPLACE FUNCTION public.admin_create_po(p_vendor_id uuid, p_warehouse_id uuid, p_items jsonb)
 RETURNS procurement_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_po public.procurement_orders;
    v_total_cost DECIMAL(12,2) := 0;
    item RECORD;
    v_product_id UUID;
    v_qty INTEGER;
    v_cost DECIMAL(12,2);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can create procurement orders';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Invalid vendor';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
        RAISE EXCEPTION 'Invalid warehouse';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Procurement order must have at least one item';
    END IF;

    -- Calculate total cost and validate items
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item.value->>'product_id')::UUID;
        v_qty := (item.value->>'quantity')::INTEGER;
        v_cost := (item.value->>'cost_per_unit')::DECIMAL(12,2);

        IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id) THEN
            RAISE EXCEPTION 'Invalid product in order: %', v_product_id;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be positive';
        END IF;

        IF v_cost < 0 THEN
            RAISE EXCEPTION 'Unit cost cannot be negative';
        END IF;

        v_total_cost := v_total_cost + (v_qty * v_cost);
    END LOOP;

    -- Create PO
    INSERT INTO public.procurement_orders (vendor_id, warehouse_id, status, total_cost)
    VALUES (p_vendor_id, p_warehouse_id, 'pending', v_total_cost)
    RETURNING * INTO v_po;

    -- Insert items
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item.value->>'product_id')::UUID;
        v_qty := (item.value->>'quantity')::INTEGER;
        v_cost := (item.value->>'cost_per_unit')::DECIMAL(12,2);
        
        -- Insert with upsert behavior to normalize duplicates from frontend array
        INSERT INTO public.procurement_order_items (procurement_order_id, product_id, quantity, cost_per_unit)
        VALUES (v_po.id, v_product_id, v_qty, v_cost)
        ON CONFLICT (procurement_order_id, product_id)
        DO UPDATE SET quantity = public.procurement_order_items.quantity + EXCLUDED.quantity;
    END LOOP;

    PERFORM public.write_admin_audit_log(
        'PO_CREATED', 'procurement_orders', (v_po.id)::text, p_warehouse_id, NULL,
        jsonb_build_object('vendor_id', p_vendor_id, 'total', v_total_cost, 'items', p_items)
    );

    RETURN v_po;
END;
$BODY$;
`;

const admin_update_po_status = `
CREATE OR REPLACE FUNCTION public.admin_update_po_status(p_po_id uuid, p_new_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_old_status TEXT;
    v_wh_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can update PO status';
    END IF;

    IF p_new_status NOT IN ('approved', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition: %', p_new_status;
    END IF;

    SELECT status, warehouse_id INTO v_old_status, v_wh_id FROM public.procurement_orders WHERE id = p_po_id FOR UPDATE;

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'PO not found';
    END IF;

    IF v_old_status = 'delivered' THEN
        RAISE EXCEPTION 'Cannot modify a delivered PO';
    END IF;
    
    IF v_old_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot modify a cancelled PO';
    END IF;

    IF p_new_status = 'approved' AND v_old_status != 'pending' THEN
        RAISE EXCEPTION 'Only pending POs can be approved';
    END IF;

    UPDATE public.procurement_orders SET status = p_new_status WHERE id = p_po_id;

    PERFORM public.write_admin_audit_log(
        'PO_STATUS_CHANGED', 'procurement_orders', p_po_id::text, v_wh_id,
        jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_new_status)
    );

    RETURN TRUE;
END;
$BODY$;
`;

let receive_procurement_order = fs.readFileSync('f3.json', 'utf16le');
receive_procurement_order = receive_procurement_order.substring(receive_procurement_order.indexOf('{'));
receive_procurement_order = JSON.parse(receive_procurement_order).rows[0].pg_get_functiondef;
receive_procurement_order = receive_procurement_order.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
receive_procurement_order = receive_procurement_order.replace("    UPDATE public.procurement_orders \n    SET status = 'delivered' \n    WHERE id = p_procurement_id;\n\n    RETURN TRUE;", "    UPDATE public.procurement_orders \n    SET status = 'delivered' \n    WHERE id = p_procurement_id;\n\n    PERFORM public.write_admin_audit_log(\n        'PO_DELIVERED', 'procurement_orders', p_procurement_id::text, p_warehouse_id,\n        jsonb_build_object('status', v_status), jsonb_build_object('status', 'delivered', 'batches', p_batches)\n    );\n\n    RETURN TRUE;");

let suspend_profile = fs.readFileSync('f4.json', 'utf16le');
suspend_profile = suspend_profile.substring(suspend_profile.indexOf('{'));
suspend_profile = JSON.parse(suspend_profile).rows[0].pg_get_functiondef;
suspend_profile = suspend_profile.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
suspend_profile = suspend_profile.replace("  WHERE id = p_user_id;\nEND;", "  WHERE id = p_user_id;\n\n  PERFORM public.write_admin_audit_log(\n        'USER_SUSPENDED', 'profiles', p_user_id::text, NULL,\n        jsonb_build_object('is_suspended', false), jsonb_build_object('is_suspended', true),\n        jsonb_build_object('reason', p_reason)\n    );\nEND;");

let unsuspend_profile = fs.readFileSync('f5.json', 'utf16le');
unsuspend_profile = unsuspend_profile.substring(unsuspend_profile.indexOf('{'));
unsuspend_profile = JSON.parse(unsuspend_profile).rows[0].pg_get_functiondef;
unsuspend_profile = unsuspend_profile.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
unsuspend_profile = unsuspend_profile.replace("  WHERE id = p_user_id;\nEND;", "  WHERE id = p_user_id;\n\n  PERFORM public.write_admin_audit_log(\n        'USER_UNSUSPENDED', 'profiles', p_user_id::text, NULL,\n        jsonb_build_object('is_suspended', true), jsonb_build_object('is_suspended', false), NULL\n    );\nEND;");

let approve_staff_role = fs.readFileSync('f6.json', 'utf16le');
approve_staff_role = approve_staff_role.substring(approve_staff_role.indexOf('{'));
approve_staff_role = JSON.parse(approve_staff_role).rows[0].pg_get_functiondef;
approve_staff_role = approve_staff_role.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
approve_staff_role = approve_staff_role.replace("DECLARE", "DECLARE\n  v_target RECORD;");
if (!approve_staff_role.includes('DECLARE')) {
  approve_staff_role = approve_staff_role.replace("BEGIN", "DECLARE\n  v_target RECORD;\nBEGIN");
}
approve_staff_role = approve_staff_role.replace("  UPDATE public.profiles ", "  SELECT role INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;\n\n  UPDATE public.profiles ");
approve_staff_role = approve_staff_role.replace("  WHERE id = p_user_id;\nEND;", "  WHERE id = p_user_id;\n\n  PERFORM public.write_admin_audit_log(\n        'STAFF_APPROVED', 'profiles', p_user_id::text, NULL,\n        jsonb_build_object('role', v_target.role),\n        jsonb_build_object('role', p_role), NULL\n    );\nEND;");

let admin_update_staff_role = fs.readFileSync('f7.json', 'utf16le');
admin_update_staff_role = admin_update_staff_role.substring(admin_update_staff_role.indexOf('{'));
admin_update_staff_role = JSON.parse(admin_update_staff_role).rows[0].pg_get_functiondef;
admin_update_staff_role = admin_update_staff_role.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
admin_update_staff_role = admin_update_staff_role.replace("    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;\n    RETURN TRUE;", "    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;\n\n    PERFORM public.write_admin_audit_log(\n        'STAFF_ROLE_CHANGED', 'profiles', p_target_id::text, NULL,\n        jsonb_build_object('role', v_old_role), jsonb_build_object('role', p_role), NULL\n    );\n\n    RETURN TRUE;");

let admin_update_staff_warehouse = fs.readFileSync('f8.json', 'utf16le');
admin_update_staff_warehouse = admin_update_staff_warehouse.substring(admin_update_staff_warehouse.indexOf('{'));
admin_update_staff_warehouse = JSON.parse(admin_update_staff_warehouse).rows[0].pg_get_functiondef;
admin_update_staff_warehouse = admin_update_staff_warehouse.replace('$function$', '$BODY$').replace('$function$', '$BODY$;');
admin_update_staff_warehouse = admin_update_staff_warehouse.replace("    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;\n    RETURN TRUE;", "    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;\n\n    PERFORM public.write_admin_audit_log(\n        'STAFF_WAREHOUSE_REASSIGNED', 'profiles', p_target_id::text, NULL,\n        jsonb_build_object('assigned_warehouse_id', null), jsonb_build_object('assigned_warehouse_id', p_warehouse_id), NULL\n    );\n\n    RETURN TRUE;");

let header = `-- 20260902000003_audit_closure.sql

-- 1. Hook PO Operations
`;

let middle = `
-- 2. Hook General Table Audits (using the generic trigger)
CREATE OR REPLACE FUNCTION public.generic_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
    v_action TEXT;
    v_entity TEXT;
    v_entity_id TEXT;
    v_before JSONB := NULL;
    v_after JSONB := NULL;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN RETURN COALESCE(NEW, OLD); END IF;

    v_entity := TG_TABLE_NAME;
    v_action := UPPER(v_entity) || '_' || TG_OP;
    
    IF TG_OP = 'INSERT' THEN
        v_entity_id := NEW.id::text;
        v_after := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_entity_id := NEW.id::text;
        v_before := to_jsonb(OLD);
        v_after := to_jsonb(NEW);
        IF v_before = v_after THEN RETURN NEW; END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id::text;
        v_before := to_jsonb(OLD);
    END IF;

    -- Strip secrets just in case (though these tables shouldn't have them)
    IF v_before ? 'password' THEN v_before := v_before - 'password'; END IF;
    IF v_after ? 'password' THEN v_after := v_after - 'password'; END IF;

    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, before_state, after_state
    ) VALUES (
        v_admin_id, v_action, v_entity, v_entity_id, v_before, v_after
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_audit_coupons ON public.coupons;
CREATE TRIGGER trg_audit_coupons AFTER INSERT OR UPDATE OR DELETE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.generic_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_platform_settings ON public.platform_settings;
CREATE TRIGGER trg_audit_platform_settings AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.generic_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_warehouses ON public.warehouses;
CREATE TRIGGER trg_audit_warehouses AFTER INSERT OR UPDATE OR DELETE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.generic_audit_trigger();

-- 5. Workforce RPC Hooks
`;

let footer = `
-- Remove generic profile trigger since we use authoritative RPCs
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
`;

let result = header + 
             admin_create_po + '\n' + 
             admin_update_po_status + '\n' + 
             receive_procurement_order + '\n' + 
             middle + '\n' + 
             suspend_profile + '\n' + 
             unsuspend_profile + '\n' + 
             approve_staff_role + '\n' + 
             admin_update_staff_role + '\n' + 
             admin_update_staff_warehouse + '\n' + 
             footer;

fs.writeFileSync('supabase/migrations/20260902000003_audit_closure.sql', result);
console.log('Successfully rebuilt 00003');
