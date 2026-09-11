-- Migration 20260903000000_p0_warehouse_enums.sql

-- 1. Enum changes
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'warehouse_manager';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'waiting_for_packing';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'packing';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'staged';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'handed_off';
