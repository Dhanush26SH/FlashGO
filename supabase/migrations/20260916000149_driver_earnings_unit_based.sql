-- Migration: 20260916000149_driver_earnings_unit_based.sql
-- Description: Driver Delivery Earnings based on Order Units (SUM quantity).

-- 1. Create Driver Earning Rate Cards
CREATE TABLE IF NOT EXISTS public.driver_earning_rate_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE NOT NULL,
    effective_from TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.driver_earning_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on rate cards"
ON public.driver_earning_rate_cards
AS PERMISSIVE FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 2. Create Driver Earning Tiers (with exact range overlap protection)
-- Note: The 'int4range' exclude constraint requires the 'btree_gist' extension.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.driver_earning_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_card_id UUID REFERENCES public.driver_earning_rate_cards(id) ON DELETE CASCADE NOT NULL,
    min_items INTEGER NOT NULL CHECK (min_items >= 1),
    max_items INTEGER CHECK (max_items IS NULL OR max_items >= min_items),
    earning_amount NUMERIC(10, 2) NOT NULL CHECK (earning_amount >= 0),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Exclude overlapping ranges within the same rate card.
    CONSTRAINT driver_earning_tiers_no_overlap 
        EXCLUDE USING GIST (
            rate_card_id WITH =,
            int4range(
                min_items,
                CASE WHEN max_items IS NULL THEN NULL ELSE max_items + 1 END,
                '[)'
            ) WITH &&
        )
);

ALTER TABLE public.driver_earning_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on tiers"
ON public.driver_earning_tiers
AS PERMISSIVE FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 3. Idempotency Constraint on Financial Ledger
-- Ensure only ONE delivery_earning exists per trip.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_trip_delivery_earning 
ON public.driver_financial_ledger (trip_id) 
WHERE transaction_type = 'delivery_earning';

-- 4. Update Completion RPC to seamlessly handle earnings.
CREATE OR REPLACE FUNCTION public.driver_complete_delivery(p_trip_id UUID, p_cod_collected BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_order RECORD;
    v_otp_rec RECORD;
    v_driver_email TEXT;
    v_is_test_driver BOOLEAN := false;

    v_total_units INTEGER := 0;
    v_rate_card_id UUID;
    v_tier RECORD;
    v_earning_amount NUMERIC(10,2);
BEGIN
    SELECT email INTO v_driver_email FROM auth.users WHERE id = v_driver_id;
    IF v_driver_email = 'drivarrr1@gmail.com' THEN
        v_is_test_driver := true;
    END IF;

    SELECT * INTO v_trip FROM public.logistics_trips WHERE id = p_trip_id FOR UPDATE;
    IF v_trip.id IS NULL OR v_trip.driver_id != v_driver_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_YOUR_TRIP');
    END IF;
    IF v_trip.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_COMPLETED');
    END IF;
    IF v_trip.arrived_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ARRIVED');
    END IF;

    IF v_trip.route_distance_meters IS NULL THEN
        IF NOT v_is_test_driver THEN
            RETURN jsonb_build_object('success', false, 'code', 'ROUTE_DISTANCE_UNAVAILABLE');
        END IF;
    END IF;

    -- SECURE CONCURRENCY: Lock the order
    SELECT * INTO v_order FROM public.orders WHERE trip_id = p_trip_id AND status NOT IN ('cancelled') LIMIT 1 FOR UPDATE;
    
    -- OTP Requirement Check
    IF v_order.total_amount > 1000 THEN
        SELECT * INTO v_otp_rec FROM public.order_delivery_otp WHERE order_id = v_order.id;
        IF v_otp_rec.status != 'verified' THEN
             RETURN jsonb_build_object('success', false, 'code', 'OTP_REQUIRED');
        END IF;
    END IF;
    
    -- COD Requirement Check (Isolated)
    IF v_order.payment_method = 'cod' THEN
        IF NOT p_cod_collected AND NOT COALESCE(v_order.cod_collected, false) THEN
             RETURN jsonb_build_object('success', false, 'code', 'COD_NOT_COLLECTED');
        END IF;
        
        -- Mark COD collected.
        IF NOT COALESCE(v_order.cod_collected, false) THEN
            UPDATE public.orders SET cod_collected = true, updated_at = NOW() WHERE id = v_order.id;
        END IF;
    END IF;
    
    -- Complete Trip (Idempotently preserve delivered_at)
    UPDATE public.logistics_trips 
    SET status = 'completed', 
        delivered_at = COALESCE(delivered_at, NOW()),
        updated_at = NOW() 
    WHERE id = p_trip_id
    RETURNING delivered_at INTO v_trip.delivered_at;
    
    -- Complete Order
    UPDATE public.orders SET status = 'delivered', updated_at = NOW() WHERE id = v_order.id;

    INSERT INTO public.order_events (order_id, actor_id, actor_role, event_type, previous_status, new_status, description, metadata, idempotency_key)
    VALUES (v_order.id, v_driver_id, NULL, 'delivered', 'in_transit', 'delivered', 'Delivery completed', jsonb_build_object('cod_collected', p_cod_collected), NULL);
        
    -- Check long distance return (> 5000 meters route distance)
    IF v_trip.route_distance_meters IS NOT NULL AND v_trip.route_distance_meters > 5000 THEN
        INSERT INTO public.driver_return_tasks (driver_id, trip_id, warehouse_id)
        VALUES (v_driver_id, p_trip_id, v_trip.warehouse_id)
        ON CONFLICT DO NOTHING;
    END IF;
    
    -- =========================================================
    -- FINANCIAL ENGINE (DELIVERY EARNINGS)
    -- =========================================================
    BEGIN
        -- Calculate Total Units
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_units
        FROM public.order_items
        WHERE order_id = v_order.id;

        IF v_total_units > 0 THEN
            -- Find the rate card effective at the exact time of completion
            SELECT id INTO v_rate_card_id
            FROM public.driver_earning_rate_cards
            WHERE warehouse_id = v_trip.warehouse_id
              AND effective_from <= v_trip.delivered_at
              AND status = 'active'
            ORDER BY effective_from DESC
            LIMIT 1;

            IF v_rate_card_id IS NOT NULL THEN
                -- Find matching tier
                SELECT * INTO v_tier
                FROM public.driver_earning_tiers
                WHERE rate_card_id = v_rate_card_id
                  AND int4range(min_items, CASE WHEN max_items IS NULL THEN NULL ELSE max_items + 1 END, '[)') @> v_total_units
                LIMIT 1;

                IF v_tier.id IS NOT NULL THEN
                    v_earning_amount := v_tier.earning_amount;
                    
                    -- Insert immutable earning via internal block ignoring duplication errors due to unique index
                    BEGIN
                        INSERT INTO public.driver_financial_ledger (
                            driver_id,
                            amount,
                            transaction_type,
                            order_id,
                            trip_id,
                            description,
                            metadata
                        )
                        VALUES (
                            v_driver_id,
                            v_earning_amount,
                            'delivery_earning',
                            v_order.id,
                            v_trip.id,
                            'Delivery Earning (' || v_total_units || ' items)',
                            jsonb_build_object(
                                'rate_card_id', v_rate_card_id,
                                'tier_id', v_tier.id,
                                'warehouse_id', v_trip.warehouse_id,
                                'total_units', v_total_units,
                                'min_items', v_tier.min_items,
                                'max_items', v_tier.max_items,
                                'earning_amount', v_earning_amount
                            )
                        );
                    EXCEPTION WHEN unique_violation THEN
                        -- Expected on rare retry race condition, safely ignore
                    END;
                ELSE
                    RAISE WARNING 'No driver earning tier matched for trip % (Units: %)', p_trip_id, v_total_units;
                END IF;
            ELSE
                RAISE WARNING 'No active driver earning rate card found for warehouse % at %', v_trip.warehouse_id, v_trip.delivered_at;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Swallow any financial calculation exceptions strictly so delivery remains successful.
        RAISE WARNING 'Driver financial calculation failed for trip %: %', p_trip_id, SQLERRM;
    END;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Admin Missing Earnings Reconciliation View/RPC
CREATE OR REPLACE FUNCTION public.admin_get_missing_driver_earnings(p_warehouse_id UUID)
RETURNS TABLE (
    trip_id UUID,
    driver_id UUID,
    driver_name TEXT,
    order_id UUID,
    delivered_at TIMESTAMPTZ,
    total_units BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        lt.id as trip_id,
        lt.driver_id,
        dp.full_name as driver_name,
        o.id as order_id,
        lt.delivered_at,
        (SELECT COALESCE(SUM(quantity), 0) FROM public.order_items WHERE order_id = o.id) as total_units
    FROM public.logistics_trips lt
    JOIN public.orders o ON o.trip_id = lt.id
    LEFT JOIN public.profiles dp ON dp.id = lt.driver_id
    WHERE lt.warehouse_id = p_warehouse_id
      AND lt.status = 'completed'
      AND lt.driver_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.driver_financial_ledger dfl 
          WHERE dfl.trip_id = lt.id AND dfl.transaction_type = 'delivery_earning'
      )
    ORDER BY lt.delivered_at DESC;
END;
$$;
