CREATE POLICY "Drivers can view own return tasks"
ON public.driver_return_tasks
FOR SELECT
TO authenticated
USING (driver_id = auth.uid());
