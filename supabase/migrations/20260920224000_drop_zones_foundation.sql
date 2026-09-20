-- Migration: 20260920224000_drop_zones_foundation.sql
-- Description: Phase 1 foundation for Drop Zones

CREATE TABLE IF NOT EXISTS public.drop_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    zone_code TEXT NOT NULL CHECK (zone_code ~ '^[A-Z0-9\-]+$'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(warehouse_id, zone_code),
    UNIQUE(qr_token)
);

-- Trigger to normalize zone_code
CREATE OR REPLACE FUNCTION public.normalize_drop_zone_code()
RETURNS TRIGGER AS $$
BEGIN
    NEW.zone_code := UPPER(TRIM(NEW.zone_code));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_drop_zone_code
BEFORE INSERT OR UPDATE ON public.drop_zones
FOR EACH ROW
EXECUTE FUNCTION public.normalize_drop_zone_code();

-- Standard updated_at trigger
CREATE OR REPLACE FUNCTION public.update_drop_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_public_drop_zones_updated_at
BEFORE UPDATE ON public.drop_zones
FOR EACH ROW
EXECUTE FUNCTION public.update_drop_zones_updated_at();

-- RLS
ALTER TABLE public.drop_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admins can manage drop zones" ON public.drop_zones FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Warehouse Managers can manage drop zones" ON public.drop_zones FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'warehouse_manager' AND warehouse_id = drop_zones.warehouse_id)
);
