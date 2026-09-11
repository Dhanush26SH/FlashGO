-- 20260902000007_phase23_promotions.sql

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT,
    image_url TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category', 'none')),
    target_id TEXT,
    active BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_promotion_dates CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CONSTRAINT chk_promotion_image_url CHECK (image_url ~ '^https?://')
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers and staff read active promotions" ON public.promotions;
CREATE POLICY "Customers and staff read active promotions" ON public.promotions
    FOR SELECT
    USING (
        active = true 
        AND (starts_at IS NULL OR starts_at <= now()) 
        AND (ends_at IS NULL OR ends_at > now())
    );

DROP POLICY IF EXISTS "Admins full access to promotions" ON public.promotions;
CREATE POLICY "Admins full access to promotions" ON public.promotions
    FOR ALL
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Helper to validate target
CREATE OR REPLACE FUNCTION public.validate_promotion_target(p_target_type TEXT, p_target_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
BEGIN
    IF p_target_type = 'none' THEN
        IF p_target_id IS NOT NULL AND p_target_id != '' THEN
            RAISE EXCEPTION 'target_id must be null for target_type none';
        END IF;
        RETURN TRUE;
    END IF;

    IF p_target_type = 'product' THEN
        IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_target_id::uuid) THEN
            RAISE EXCEPTION 'Product target not found';
        END IF;
        RETURN TRUE;
    END IF;

    IF p_target_type = 'category' THEN
        IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_target_id::uuid) THEN
            RAISE EXCEPTION 'Category target not found';
        END IF;
        RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'Invalid target type';
END;
$BODY$;

-- Create Promotion RPC
CREATE OR REPLACE FUNCTION public.admin_create_promotion(
    p_title TEXT,
    p_subtitle TEXT,
    p_image_url TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_active BOOLEAN,
    p_display_order INTEGER,
    p_starts_at TIMESTAMP WITH TIME ZONE,
    p_ends_at TIMESTAMP WITH TIME ZONE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
    v_promo_id UUID;
BEGIN
    v_admin_id := auth.uid();
    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    PERFORM public.validate_promotion_target(p_target_type, p_target_id);

    INSERT INTO public.promotions (
        title, subtitle, image_url, target_type, target_id, active, display_order, starts_at, ends_at, created_by
    ) VALUES (
        p_title, p_subtitle, p_image_url, p_target_type, NULLIF(p_target_id, ''), p_active, p_display_order, p_starts_at, p_ends_at, v_admin_id
    ) RETURNING id INTO v_promo_id;

    -- Write Audit Log
    PERFORM public.write_admin_audit_log(
        'PROMOTION_CREATED', 'promotions', v_promo_id::text, NULL,
        NULL,
        jsonb_build_object('title', p_title, 'target_type', p_target_type, 'target_id', p_target_id)
    );

    RETURN v_promo_id;
END;
$BODY$;

-- Update Promotion RPC
CREATE OR REPLACE FUNCTION public.admin_update_promotion(
    p_promo_id UUID,
    p_title TEXT,
    p_subtitle TEXT,
    p_image_url TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_active BOOLEAN,
    p_display_order INTEGER,
    p_starts_at TIMESTAMP WITH TIME ZONE,
    p_ends_at TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
    v_old_promo RECORD;
BEGIN
    v_admin_id := auth.uid();
    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_old_promo FROM public.promotions WHERE id = p_promo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Promotion not found'; END IF;

    PERFORM public.validate_promotion_target(p_target_type, p_target_id);

    UPDATE public.promotions SET
        title = p_title,
        subtitle = p_subtitle,
        image_url = p_image_url,
        target_type = p_target_type,
        target_id = NULLIF(p_target_id, ''),
        active = p_active,
        display_order = p_display_order,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        updated_at = now()
    WHERE id = p_promo_id;

    -- Write Audit Log
    PERFORM public.write_admin_audit_log(
        'PROMOTION_UPDATED', 'promotions', p_promo_id::text, NULL,
        to_jsonb(v_old_promo),
        jsonb_build_object('title', p_title, 'active', p_active)
    );

    RETURN TRUE;
END;
$BODY$;

-- Delete Promotion RPC
CREATE OR REPLACE FUNCTION public.admin_delete_promotion(p_promo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
    v_admin_id UUID;
    v_role TEXT;
    v_old_promo RECORD;
BEGIN
    v_admin_id := auth.uid();
    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_old_promo FROM public.promotions WHERE id = p_promo_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    DELETE FROM public.promotions WHERE id = p_promo_id;

    -- Write Audit Log
    PERFORM public.write_admin_audit_log(
        'PROMOTION_DELETED', 'promotions', p_promo_id::text, NULL,
        to_jsonb(v_old_promo),
        NULL
    );

    RETURN TRUE;
END;
$BODY$;
