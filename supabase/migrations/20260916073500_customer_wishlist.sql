-- Create customer_wishlist table
CREATE TABLE IF NOT EXISTS public.customer_wishlist (
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (customer_id, product_id)
);

-- Enable RLS
ALTER TABLE public.customer_wishlist ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Customers can view their own wishlist"
    ON public.customer_wishlist FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

CREATE POLICY "Customers can insert into their own wishlist"
    ON public.customer_wishlist FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can delete from their own wishlist"
    ON public.customer_wishlist FOR DELETE
    TO authenticated
    USING (auth.uid() = customer_id);
