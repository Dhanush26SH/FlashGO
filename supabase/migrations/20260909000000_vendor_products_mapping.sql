-- Migration: Vendor-Product Mapping

-- 1. Table Definition
CREATE TABLE public.vendor_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    vendor_sku TEXT,
    purchase_price NUMERIC CHECK (purchase_price >= 0),
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(vendor_id, product_id)
);

CREATE INDEX idx_vendor_products_vendor_id ON public.vendor_products(vendor_id);
CREATE INDEX idx_vendor_products_product_id ON public.vendor_products(product_id);

-- 2. Row Level Security
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users"
ON public.vendor_products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow all access to admin users"
ON public.vendor_products FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND profiles.role = 'admin'
    )
);

-- 3. Backend Enforcement (admin_create_po)
-- We must update the admin_create_po RPC to enforce the mapping.
CREATE OR REPLACE FUNCTION public.admin_create_po(
    p_vendor_id UUID,
    p_warehouse_id UUID,
    p_items JSONB,
    p_admin_id UUID DEFAULT auth.uid()
)
RETURNS public.procurement_orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order public.procurement_orders;
    v_total_cost NUMERIC := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_cost_per_unit NUMERIC;
    v_user_role TEXT;
BEGIN
    -- 1. Validate Caller
    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_admin_id;
    IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can create procurement orders';
    END IF;

    -- 2. Validate Items and Calculate Total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_cost_per_unit := (v_item->>'cost_per_unit')::NUMERIC;
        
        IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
        IF v_cost_per_unit < 0 THEN RAISE EXCEPTION 'Cost cannot be negative'; END IF;

        -- ENFORCEMENT: Check if product is mapped to vendor
        IF NOT EXISTS (
            SELECT 1 FROM public.vendor_products vp
            WHERE vp.vendor_id = p_vendor_id 
              AND vp.product_id = v_product_id
              AND vp.is_active = true
        ) THEN
            RAISE EXCEPTION 'Product % is not mapped to vendor %', v_product_id, p_vendor_id;
        END IF;
        
        v_total_cost := v_total_cost + (v_quantity * v_cost_per_unit);
    END LOOP;

    -- 3. Create PO
    INSERT INTO public.procurement_orders (vendor_id, warehouse_id, total_cost, status, created_by)
    VALUES (p_vendor_id, p_warehouse_id, v_total_cost, 'pending', p_admin_id)
    RETURNING * INTO v_order;

    -- 4. Create PO Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.procurement_order_items (
            procurement_order_id, product_id, quantity, cost_per_unit
        ) VALUES (
            v_order.id, 
            (v_item->>'product_id')::UUID, 
            (v_item->>'quantity')::INTEGER, 
            (v_item->>'cost_per_unit')::NUMERIC
        );
    END LOOP;

    -- 5. Audit Log
    PERFORM public.write_admin_audit_log(
        p_admin_id,
        'CREATE_PO',
        'Created procurement order ' || v_order.id,
        v_order.id,
        jsonb_build_object('total_cost', v_total_cost, 'items', p_items)
    );

    RETURN v_order;
END;
$$;
