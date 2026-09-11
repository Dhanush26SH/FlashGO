-- 1. Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive/broken policies if any (we know it was false, but just in case)
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admin view operational orders" ON public.orders;
DROP POLICY IF EXISTS "Admin update operational orders" ON public.orders;
DROP POLICY IF EXISTS "Picker view relevant orders" ON public.orders;
DROP POLICY IF EXISTS "Picker update assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Driver view assigned trip orders" ON public.orders;
DROP POLICY IF EXISTS "Warehouse staff view relevant orders" ON public.orders;
DROP POLICY IF EXISTS "Warehouse staff update relevant orders" ON public.orders;

DROP POLICY IF EXISTS "Customers view own order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admin update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Picker view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Picker update assigned order_items" ON public.order_items;
DROP POLICY IF EXISTS "Driver view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Warehouse staff view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Warehouse staff update order_items" ON public.order_items;

-- 3. Create Orders Policies

-- Customer
CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT USING (
    auth.uid() = customer_id
);

-- Admin
CREATE POLICY "Admin view operational orders" ON public.orders FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);
CREATE POLICY "Admin update operational orders" ON public.orders FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);

-- Picker
CREATE POLICY "Picker view relevant orders" ON public.orders FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'picker')
    AND (
        picker_id = auth.uid() OR
        warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
);
CREATE POLICY "Picker update assigned orders" ON public.orders FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'picker')
    AND (picker_id = auth.uid())
);

-- Driver
CREATE POLICY "Driver view assigned trip orders" ON public.orders FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'driver')
    AND trip_id IN (SELECT id FROM public.logistics_trips WHERE driver_id = auth.uid())
);
-- Note: Driver update (delivery status) happens via complete_trip RPC, so we do not grant raw UPDATE on orders table.

-- Warehouse Staff
CREATE POLICY "Warehouse staff view relevant orders" ON public.orders FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'warehouse_staff')
    AND warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Warehouse staff update relevant orders" ON public.orders FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'warehouse_staff')
    AND warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
);


-- 4. Create Order Items Policies

-- Customer
CREATE POLICY "Customers view own order_items" ON public.order_items FOR SELECT USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
);

-- Admin
CREATE POLICY "Admin view order_items" ON public.order_items FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);
CREATE POLICY "Admin update order_items" ON public.order_items FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);

-- Picker
CREATE POLICY "Picker view order_items" ON public.order_items FOR SELECT USING (
    order_id IN (
        SELECT id FROM public.orders 
        WHERE picker_id = auth.uid() OR warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
);
CREATE POLICY "Picker update assigned order_items" ON public.order_items FOR UPDATE USING (
    order_id IN (
        SELECT id FROM public.orders 
        WHERE picker_id = auth.uid()
    )
);

-- Driver
CREATE POLICY "Driver view order_items" ON public.order_items FOR SELECT USING (
    order_id IN (
        SELECT id FROM public.orders 
        WHERE trip_id IN (SELECT id FROM public.logistics_trips WHERE driver_id = auth.uid())
    )
);

-- Warehouse Staff
CREATE POLICY "Warehouse staff view order_items" ON public.order_items FOR SELECT USING (
    order_id IN (
        SELECT id FROM public.orders 
        WHERE warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
);
CREATE POLICY "Warehouse staff update order_items" ON public.order_items FOR UPDATE USING (
    order_id IN (
        SELECT id FROM public.orders 
        WHERE warehouse_id IN (SELECT warehouse_id FROM public.profiles WHERE id = auth.uid())
    )
);
