-- Fix Phase 18.4 Driver Location RLS Security Gap

-- 1. Drop the insecure global read policy
DROP POLICY IF EXISTS "Customers and staff read driver sessions" ON public.driver_sessions;

-- 2. Create restricted policy for customers
CREATE POLICY "Customers read assigned driver session" 
ON public.driver_sessions 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE orders.customer_id = auth.uid()
          AND orders.driver_id = driver_sessions.driver_id
          AND orders.status = 'out_for_delivery'
    )
);

-- 3. Create restricted policy for authorized operational staff
CREATE POLICY "Admin WH read driver sessions" 
ON public.driver_sessions 
FOR SELECT 
USING (
    auth.uid() IN (
        SELECT id FROM public.profiles 
        WHERE role IN ('admin', 'warehouse_staff')
    )
);

-- Note: The existing "Drivers manage own session" policy remains untouched:
-- CREATE POLICY "Drivers manage own session" ON public.driver_sessions FOR ALL USING (auth.uid() = driver_id);
