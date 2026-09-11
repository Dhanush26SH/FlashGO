-- Migration: 20260916000003_warehouse_qr_challenges.sql
-- Description: Create warehouse_qr_challenges table with restrictive permissions

CREATE TABLE public.warehouse_qr_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    raw_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.warehouse_qr_challenges ENABLE ROW LEVEL SECURITY;

-- No policies granted. Security definer functions will bypass RLS.

CREATE INDEX idx_warehouse_qr_challenges_warehouse_id ON public.warehouse_qr_challenges (warehouse_id);
CREATE INDEX idx_warehouse_qr_challenges_expires_at ON public.warehouse_qr_challenges (expires_at);
