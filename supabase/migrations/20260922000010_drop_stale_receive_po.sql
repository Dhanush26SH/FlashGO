-- Migration: 20260922000010_drop_stale_receive_po.sql
-- Description: Drop the obsolete overloaded receive_procurement_order function to resolve PGRST203 ambiguity.

DROP FUNCTION IF EXISTS public.receive_procurement_order(
    UUID,
    TEXT,
    UUID,
    UUID,
    JSONB,
    TEXT
);
