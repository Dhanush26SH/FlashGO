-- 20260902000003_audit_closure.sql

-- 1. Hook PO Operations

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

CREATE OR REPLACE FUNCTION public.receive_procurement_order(p_procurement_id uuid, p_warehouse_id uuid, p_user_id uuid, p_batches jsonb DEFAULT '[]'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_status TEXT;
    v_target_warehouse UUID;
    v_role TEXT;
    v_is_suspended BOOLEAN;
    v_user_warehouse UUID;
    item RECORD;
    v_batch_json JSONB;
    v_batch_id UUID;
    v_batch_number TEXT;
    v_expiry_date DATE;
    v_recv_qty INTEGER;
BEGIN
    -- Auth check
    SELECT role, is_suspended, warehouse_id INTO v_role, v_is_suspended, v_user_warehouse
    FROM public.profiles WHERE id = p_user_id;

    IF v_role NOT IN ('admin', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Unauthorized: Only admin or warehouse staff can receive orders';
    END IF;

    IF v_is_suspended THEN
        RAISE EXCEPTION 'Unauthorized: Staff member is suspended';
    END IF;

    IF v_role = 'warehouse_staff' AND v_user_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Unauthorized: Warehouse staff can only receive at their assigned warehouse';
    END IF;

    -- Lock the procurement order
    SELECT status, warehouse_id INTO v_status, v_target_warehouse 
    FROM public.procurement_orders 
    WHERE id = p_procurement_id FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'PO not found';
    END IF;

    IF v_status != 'approved' THEN
        RAISE EXCEPTION 'PO is not approved for receiving (Current status: %)', v_status;
    END IF;

    IF v_target_warehouse != p_warehouse_id THEN
        RAISE EXCEPTION 'Wrong warehouse: PO belongs to a different warehouse';
    END IF;

    -- Loop through items and atomically update stock
    FOR item IN SELECT product_id, quantity FROM public.procurement_order_items WHERE procurement_order_id = p_procurement_id
    LOOP
        -- Find the batch entry
        SELECT * INTO v_batch_json 
        FROM jsonb_array_elements(p_batches) AS b 
        WHERE (b->>'product_id')::UUID = item.product_id 
        LIMIT 1;
        
        IF v_batch_json IS NULL THEN
            RAISE EXCEPTION 'Batch details missing for product %', item.product_id;
        END IF;

        v_batch_number := v_batch_json->>'batch_number';
        v_expiry_date := (v_batch_json->>'expiry_date')::DATE;
        v_recv_qty := (v_batch_json->>'received_quantity')::INTEGER;
        
        IF v_recv_qty <= 0 THEN
            RAISE EXCEPTION 'Received quantity must be positive';
        END IF;

        IF v_recv_qty > item.quantity THEN
            RAISE EXCEPTION 'Received quantity (%) cannot exceed PO quantity (%) for product %', v_recv_qty, item.quantity, item.product_id;
        END IF;

        IF v_batch_number IS NULL OR trim(v_batch_number) = '' THEN
            RAISE EXCEPTION 'Batch number cannot be empty';
        END IF;

        IF v_expiry_date IS NULL THEN
            RAISE EXCEPTION 'Expiry date cannot be empty';
        END IF;

        -- Attempt to find existing batch
        SELECT id INTO v_batch_id FROM public.product_batches 
        WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id AND batch_number = v_batch_number 
        LIMIT 1;

        IF v_batch_id IS NOT NULL THEN
            UPDATE public.product_batches 
            SET received_quantity = received_quantity + v_recv_qty, 
                available_quantity = available_quantity + v_recv_qty
            WHERE id = v_batch_id;
        ELSE
            -- Create batch
            INSERT INTO public.product_batches (
                product_id, warehouse_id, batch_number, expiry_date, received_quantity, available_quantity, status
            ) VALUES (
                item.product_id, p_warehouse_id, v_batch_number, v_expiry_date, v_recv_qty, v_recv_qty, 'active'
            ) RETURNING id INTO v_batch_id;
        END IF;

        -- Upsert stock (aggregate)
        INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty)
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity;

        -- Create stock ledger with batch_id
        INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by, batch_id)
        VALUES (p_warehouse_id, item.product_id, v_recv_qty, 'grn', p_user_id, v_batch_id);
    END LOOP;

    -- Update procurement status atomically
    UPDATE public.procurement_orders 
    SET status = 'delivered' 
    WHERE id = p_procurement_id;

    PERFORM public.write_admin_audit_log(
        'PO_DELIVERED', 'procurement_orders', p_procurement_id::text, p_warehouse_id,
        jsonb_build_object('status', v_status), jsonb_build_object('status', 'delivered', 'batches', p_batches)
    );

    RETURN TRUE;
END;
$BODY$;


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

CREATE OR REPLACE FUNCTION public.suspend_profile(p_user_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET is_suspended = TRUE, 
      suspended_at = NOW(), 
      suspension_reason = p_reason 
  WHERE id = p_user_id;

  PERFORM public.write_admin_audit_log(
        'USER_SUSPENDED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('is_suspended', false), jsonb_build_object('is_suspended', true),
        jsonb_build_object('reason', p_reason)
    );
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.unsuspend_profile(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles 
  SET is_suspended = FALSE, 
      suspended_at = NULL, 
      suspension_reason = NULL 
  WHERE id = p_user_id;

  PERFORM public.write_admin_audit_log(
        'USER_UNSUSPENDED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('is_suspended', true), jsonb_build_object('is_suspended', false), NULL
    );
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.approve_staff_role(p_user_id uuid, p_role user_role, p_employee_id text, p_clean_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
  v_target RECORD;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  UPDATE public.profiles 
  SET role = p_role, 
      full_name = p_clean_name,
      employee_id = p_employee_id
  WHERE id = p_user_id;

  PERFORM public.write_admin_audit_log(
        'STAFF_APPROVED', 'profiles', p_user_id::text, NULL,
        jsonb_build_object('role', v_target.role),
        jsonb_build_object('role', p_role), NULL
    );
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.admin_update_staff_role(p_target_id uuid, p_role user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_old_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Cannot assign non-operational role via this workflow';
    END IF;

    SELECT role INTO v_old_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_old_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Check for active work that prevents role change
    IF v_old_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot change role: Driver has active trips';
        END IF;
    END IF;

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking'
    IF v_old_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking')) THEN
            RAISE EXCEPTION 'Cannot change role: Picker has active unfinished work';
        END IF;
    END IF;

    UPDATE public.profiles SET role = p_role WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_ROLE_CHANGED', 'profiles', p_target_id::text, NULL,
        jsonb_build_object('role', v_old_role), jsonb_build_object('role', p_role), NULL
    );

    RETURN TRUE;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.admin_update_staff_warehouse(p_target_id uuid, p_warehouse_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $BODY$
DECLARE
    v_role TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    
    IF v_role NOT IN ('picker', 'driver', 'warehouse_staff') THEN
        RAISE EXCEPTION 'Target is not a valid staff member';
    END IF;

    -- Validate active work for Pickers: assigned ('placed') or currently 'picking'
    IF v_role = 'picker' THEN
        IF EXISTS (SELECT 1 FROM public.orders WHERE picker_id = p_target_id AND status IN ('placed', 'picking')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Picker has active unfinished work';
        END IF;
    END IF;

    IF v_role = 'driver' THEN
        IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE driver_id = p_target_id AND status IN ('accepted', 'in_transit')) THEN
            RAISE EXCEPTION 'Cannot reassign warehouse: Driver has active trips';
        END IF;
    END IF;

    UPDATE public.profiles SET warehouse_id = p_warehouse_id WHERE id = p_target_id;

    PERFORM public.write_admin_audit_log(
        'STAFF_WAREHOUSE_REASSIGNED', 'profiles', p_target_id::text, NULL,
        jsonb_build_object('assigned_warehouse_id', null), jsonb_build_object('assigned_warehouse_id', p_warehouse_id), NULL
    );

    RETURN TRUE;
END;
$BODY$;


-- Remove generic profile trigger since we use authoritative RPCs
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
