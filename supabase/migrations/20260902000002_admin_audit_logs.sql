-- 20260902000002_admin_audit_logs.sql

-- 1. Create Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.profiles(id) NOT NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    warehouse_id UUID REFERENCES public.warehouses(id),
    before_state JSONB,
    after_state JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type ON public.admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity_type ON public.admin_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity_id ON public.admin_audit_logs(entity_id);

-- Immutability Trigger
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $BODY$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are forbidden.';
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON public.admin_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'admin_audit_logs' 
        AND policyname = 'Admins can view audit logs'
    ) THEN
        CREATE POLICY "Admins can view audit logs" 
        ON public.admin_audit_logs 
        FOR SELECT 
        USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
            )
        );
    END IF;
END $$;

-- No INSERT policy. Inserts are only allowed via SECURITY DEFINER functions.

-- 2. Audit Helper Function
CREATE OR REPLACE FUNCTION public.write_admin_audit_log(
    p_action_type TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_warehouse_id UUID,
    p_before_state JSONB,
    p_after_state JSONB,
    p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Audit log failed: No authenticated user context.';
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Audit log failed: User is not an admin.';
    END IF;

    INSERT INTO public.admin_audit_logs (
        admin_id, action_type, entity_type, entity_id, warehouse_id, before_state, after_state, metadata
    ) VALUES (
        v_admin_id, p_action_type, p_entity_type, p_entity_id, p_warehouse_id, p_before_state, p_after_state, p_metadata
    );
END;
$BODY$;

-- 3. Modify Authoritative Analytics/Operations
CREATE OR REPLACE FUNCTION public.admin_resolve_ticket_and_refund(
    p_ticket_id UUID,
    p_resolution_note TEXT,
    p_refund_amount DECIMAL,
    p_refunded_quantity INTEGER,
    p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_ticket RECORD;
    v_order RECORD;
    v_refund_id UUID;
    v_refund_status TEXT;
    v_customer_id UUID;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;
    IF v_ticket.status = 'resolved' THEN
        RAISE EXCEPTION 'Ticket is already resolved';
    END IF;

    IF v_ticket.order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_ticket.order_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Order not found';
        END IF;
        v_customer_id := v_order.customer_id;
    ELSE
        v_customer_id := v_ticket.customer_id;
    END IF;

    IF p_refund_amount > 0 THEN
        IF v_order.id IS NULL THEN
            RAISE EXCEPTION 'Cannot issue order refund without an associated order';
        END IF;

        IF p_refund_amount > v_order.total_amount THEN
            RAISE EXCEPTION 'Refund amount exceeds order total';
        END IF;

        INSERT INTO public.refunds (
            order_id, amount, reason, status
        ) VALUES (
            v_order.id, p_refund_amount, p_reason, 'completed'
        ) RETURNING id, status INTO v_refund_id, v_refund_status;

        UPDATE public.profiles
        SET wallet_balance = wallet_balance + p_refund_amount
        WHERE id = v_customer_id;

        INSERT INTO public.wallet_transactions (user_id, amount, type, description)
        VALUES (v_customer_id, p_refund_amount, 'credit', 'Refund for order ' || v_order.id || ': ' || p_reason);

        UPDATE public.orders SET payment_status = 'partially_refunded', updated_at = now() WHERE id = v_order.id;
    END IF;

    UPDATE public.support_tickets
    SET status = 'resolved', description = CASE WHEN description IS NULL THEN p_resolution_note ELSE description || CHR(10) || CHR(10) || 'Admin Note: ' || p_resolution_note END, updated_at = now()
    WHERE id = p_ticket_id;

    -- NEW: Audit Log
    PERFORM public.write_admin_audit_log(
        'REFUND_APPROVED',
        'refunds',
        v_refund_id::text,
        NULL,
        NULL,
        jsonb_build_object('amount', p_refund_amount, 'quantity', p_refunded_quantity, 'status', v_refund_status),
        jsonb_build_object('ticket_id', p_ticket_id, 'order_id', v_order.id)
    );

    RETURN v_refund_id;
END;
$BODY$;

-- Product Price Update Hook
CREATE OR REPLACE FUNCTION public.admin_update_product(
    p_id TEXT,
    p_price DECIMAL,
    p_image_url TEXT,
    p_is_active BOOLEAN,
    p_category TEXT,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_old_product RECORD;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative';
    END IF;

    SELECT * INTO v_old_product FROM public.products WHERE id = p_id;

    UPDATE public.products
    SET
        price = p_price,
        image_url = p_image_url,
        is_active = p_is_active,
        category = p_category,
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        updated_at = now()
    WHERE id = p_id;

    IF v_old_product.price != p_price OR v_old_product.is_active != p_is_active OR v_old_product.category != p_category THEN
        PERFORM public.write_admin_audit_log(
            'PRODUCT_UPDATED',
            'products',
            p_id,
            NULL,
            jsonb_build_object('price', v_old_product.price, 'is_active', v_old_product.is_active, 'category', v_old_product.category),
            jsonb_build_object('price', p_price, 'is_active', p_is_active, 'category', p_category),
            NULL
        );
    END IF;
END;
$BODY$;

-- We'll add a trigger for profiles to catch role changes / suspensions since they may not all use RPCs.
CREATE OR REPLACE FUNCTION public.audit_profiles_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
BEGIN
    -- Only log if it's an admin doing it, and only if role or is_suspended changed
    IF OLD.role != NEW.role OR OLD.is_suspended != NEW.is_suspended THEN
        v_admin_id := auth.uid();
        IF v_admin_id IS NOT NULL THEN
            SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
            IF v_role = 'admin' THEN
                -- Insert using standard direct insert (not the helper, because helper is security definer but trigger is already superuser context if needed, wait, trigger runs as invoker unless security definer)
                -- We'll just call the helper directly, but we need to temporarily allow trigger to execute it or just duplicate the insert since we are in trigger context.
                INSERT INTO public.admin_audit_logs (
                    admin_id, action_type, entity_type, entity_id, before_state, after_state
                ) VALUES (
                    v_admin_id,
                    CASE WHEN OLD.role != NEW.role THEN 'STAFF_ROLE_CHANGED' ELSE 'USER_SUSPENSION_CHANGED' END,
                    'profiles',
                    NEW.id::text,
                    jsonb_build_object('role', OLD.role, 'is_suspended', OLD.is_suspended),
                    jsonb_build_object('role', NEW.role, 'is_suspended', NEW.is_suspended)
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$BODY$;

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_profiles_trigger();

-- Adding more RPC hooks for Audit Logs

CREATE OR REPLACE FUNCTION public.admin_adjust_stock(
    p_product_id TEXT,
    p_warehouse_id UUID,
    p_quantity_change INTEGER,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_admin_id UUID;
    v_current_stock INTEGER;
BEGIN
    v_admin_id := auth.uid();
    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_quantity_change = 0 THEN
        RETURN;
    END IF;

    SELECT stock_quantity INTO v_current_stock FROM public.inventory
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found';
    END IF;

    IF v_current_stock + p_quantity_change < 0 THEN
        RAISE EXCEPTION 'Stock cannot be negative';
    END IF;

    UPDATE public.inventory
    SET
        stock_quantity = stock_quantity + p_quantity_change,
        updated_at = now()
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

    PERFORM public.write_admin_audit_log(
        'STOCK_ADJUSTMENT',
        'inventory',
        p_product_id,
        p_warehouse_id,
        jsonb_build_object('stock_quantity', v_current_stock),
        jsonb_build_object('stock_quantity', v_current_stock + p_quantity_change),
        jsonb_build_object('reason', p_reason, 'quantity_change', p_quantity_change)
    );
END;
$BODY$;

-- Manual Wallet Adjustment
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
    p_customer_id UUID,
    p_amount DECIMAL,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_role TEXT;
    v_type TEXT;
    v_old_balance DECIMAL;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_amount = 0 THEN RETURN; END IF;

    SELECT wallet_balance INTO v_old_balance FROM public.profiles WHERE id = p_customer_id FOR UPDATE;

    v_type := CASE WHEN p_amount > 0 THEN 'credit' ELSE 'debit' END;

    UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_customer_id;

    INSERT INTO public.wallet_transactions (user_id, amount, type, description)
    VALUES (p_customer_id, ABS(p_amount), v_type, 'Admin Adjustment: ' || p_reason);

    PERFORM public.write_admin_audit_log(
        'WALLET_ADJUSTMENT',
        'profiles',
        p_customer_id::text,
        NULL,
        jsonb_build_object('wallet_balance', v_old_balance),
        jsonb_build_object('wallet_balance', v_old_balance + p_amount),
        jsonb_build_object('reason', p_reason, 'amount', p_amount)
    );
END;
$BODY$;
