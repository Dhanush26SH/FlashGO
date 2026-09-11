-- 20260828000006_revoke_direct_product_mutations.sql
-- Revoke table-level DML privileges on products and categories from anon/authenticated roles.
-- SECURITY DEFINER RPCs run as the function owner (postgres) which bypasses both
-- table grants and RLS, so legitimate catalog mutations via RPCs continue to work.
-- Direct REST POST/PATCH/DELETE from any API client will be refused at the privilege level.

-- ── Products: revoke write privileges ────────────────────────────────────────

REVOKE INSERT ON public.products FROM anon;
REVOKE INSERT ON public.products FROM authenticated;

REVOKE UPDATE ON public.products FROM anon;
REVOKE UPDATE ON public.products FROM authenticated;

REVOKE DELETE ON public.products FROM anon;
REVOKE DELETE ON public.products FROM authenticated;

-- Keep SELECT (needed by customers, pickers, warehouse staff for reads)
-- SECURITY DEFINER RPCs still work because they run as 'postgres' (owns the table).

-- ── Categories: revoke write privileges ──────────────────────────────────────

REVOKE INSERT ON public.categories FROM anon;
REVOKE INSERT ON public.categories FROM authenticated;

REVOKE UPDATE ON public.categories FROM anon;
REVOKE UPDATE ON public.categories FROM authenticated;

REVOKE DELETE ON public.categories FROM anon;
REVOKE DELETE ON public.categories FROM authenticated;

-- ── Restore product prices that were corrupted during security testing ────────
-- The prior migration's UPDATE failed because of RLS/permission issues.
-- Now that privileges are properly in place, restore via direct SQL (runs as postgres).

UPDATE public.products
SET price = 89.00
WHERE id = '888f7899-2f74-4d18-a2b5-dfce6c354287'
  AND name = 'Amul Gold Full Cream Milk'
  AND price < 1.00;  -- Safety guard: only restore if price was tampered

UPDATE public.products
SET price = 35.00
WHERE id = 'dd69d4dd-2400-4bb2-a6ce-970fc8f9e6cd'
  AND name = 'Amul Kool Kesar'
  AND price < 1.00;  -- Safety guard: only restore if price was tampered
