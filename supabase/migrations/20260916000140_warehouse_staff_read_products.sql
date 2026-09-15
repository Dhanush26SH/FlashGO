-- Migration: 20260916000140_warehouse_staff_read_products.sql

CREATE POLICY "Warehouse staff read all products"
ON public.products
FOR SELECT
TO authenticated
USING (
    get_my_role() = 'warehouse_staff'::user_role
);
