-- 20260909000002_drop_broken_admin_create_po.sql
-- Drop the broken 4-argument signature that was accidentally introduced
DROP FUNCTION IF EXISTS public.admin_create_po(UUID, UUID, JSONB, UUID);
