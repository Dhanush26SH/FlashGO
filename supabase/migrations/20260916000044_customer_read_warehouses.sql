-- Allow any authenticated user (including customers) to read warehouse data
-- Required for rendering the Tracking map where the customer needs the warehouse coordinates

CREATE POLICY "Customers can read warehouses" 
ON public.warehouses
FOR SELECT 
USING (auth.role() = 'authenticated');
