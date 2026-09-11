-- Migration: 20260814000001_fix_substitutions.sql

-- 1. Add nullable columns first
ALTER TABLE public.order_substitutions 
ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- 2. Safely backfill existing data
DO $$
DECLARE
    sub RECORD;
    v_item_id UUID;
    v_item_qty INTEGER;
    v_item_picked INTEGER;
    v_match_count INTEGER;
BEGIN
    FOR sub IN SELECT * FROM public.order_substitutions WHERE order_item_id IS NULL
    LOOP
        -- Find how many order_items match the original_item_id for this order
        SELECT COUNT(*) INTO v_match_count 
        FROM public.order_items 
        WHERE order_id = sub.order_id 
          AND product_id = sub.original_item_id;

        IF v_match_count = 0 THEN
            RAISE EXCEPTION 'Cannot map substitution %: No matching order_item found for product % in order %', sub.id, sub.original_item_id, sub.order_id;
        ELSIF v_match_count > 1 THEN
            RAISE EXCEPTION 'Cannot map substitution %: Multiple matching order_items found for product % in order % (Ambiguous)', sub.id, sub.original_item_id, sub.order_id;
        ELSE
            -- Exactly 1 match, safely backfill
            SELECT id, quantity, picked_quantity 
            INTO v_item_id, v_item_qty, v_item_picked 
            FROM public.order_items 
            WHERE order_id = sub.order_id 
              AND product_id = sub.original_item_id;
            
            -- Assume substitution quantity is the shortfall
            UPDATE public.order_substitutions
            SET 
                order_item_id = v_item_id,
                quantity = GREATEST(1, v_item_qty - v_item_picked)
            WHERE id = sub.id;
        END IF;
    END LOOP;
END;
$$;

-- 3. Enforce constraints
ALTER TABLE public.order_substitutions
ALTER COLUMN order_item_id SET NOT NULL,
ALTER COLUMN quantity SET NOT NULL,
ADD CONSTRAINT positive_sub_quantity CHECK (quantity > 0);
