-- Migration: 20260814000005_add_cod_collections.sql
-- Description: Adds a dedicated table for per-order COD tracking and related RPCs

CREATE TYPE cod_status AS ENUM ('pending', 'collected', 'settled');

CREATE TABLE IF NOT EXISTS public.cod_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    driver_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status cod_status NOT NULL DEFAULT 'pending',
    collected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    collected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own cod_collections" ON public.cod_collections FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Admins manage cod_collections" ON public.cod_collections FOR ALL USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin')));

-- RPC to securely increase driver liability and create pending COD collection atomically
CREATE OR REPLACE FUNCTION register_cod_delivery(
    p_order_id UUID,
    p_driver_id UUID,
    p_amount DECIMAL
) RETURNS BOOLEAN AS $$
BEGIN
    -- 1. Insert pending COD collection. Ignore if already exists (idempotent)
    INSERT INTO public.cod_collections (order_id, driver_id, amount, status)
    VALUES (p_order_id, p_driver_id, p_amount, 'pending')
    ON CONFLICT (order_id) DO NOTHING;

    -- 2. Increment driver liability
    UPDATE public.profiles 
    SET cod_wallet_liability = COALESCE(cod_wallet_liability, 0) + p_amount 
    WHERE id = p_driver_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC for admin to mark COD as collected from driver
CREATE OR REPLACE FUNCTION mark_cod_collected(
    p_order_id UUID,
    p_admin_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_collection_id UUID;
    v_status cod_status;
BEGIN
    SELECT id, status INTO v_collection_id, v_status 
    FROM public.cod_collections 
    WHERE order_id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_status != 'pending' THEN
        RETURN TRUE; -- Idempotent
    END IF;

    UPDATE public.cod_collections 
    SET status = 'collected', collected_by = p_admin_id, collected_at = now(), updated_at = now()
    WHERE id = v_collection_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
