-- 20260915130000_drop_obsolete_receive_procurement_order.sql
-- Drops the obsolete overloaded receive_procurement_order function to resolve PGRST203 ambiguity.
-- The canonical function now contains supplier dispatch batch logic.

DROP FUNCTION IF EXISTS public.receive_procurement_order(
    p_procurement_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID,
    p_receipt_number TEXT,
    p_notes TEXT,
    p_items JSONB
);
