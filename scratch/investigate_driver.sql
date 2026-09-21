-- 1. Check if Driver1 exists
WITH driver AS (
  SELECT id FROM public.profiles WHERE role = 'driver' AND full_name ILIKE '%Driver1%' LIMIT 1
)
SELECT 
  'DRIVER1_ID' as metric, id::text as value 
FROM driver

UNION ALL

-- 2. Check if a settlement already exists for week_start = '2026-09-14'
SELECT 
  'EXISTING_SETTLEMENT' as metric, 
  id::text || ' | status: ' || status || ' | net: ' || net_amount::text as value
FROM public.driver_settlements
WHERE driver_id = (SELECT id FROM driver) AND week_start = '2026-09-14'

UNION ALL

-- 3. Check for previous unsettled ledgers (older than 2026-09-14)
SELECT
  'OLD_UNSETTLED_COUNT' as metric,
  count(dfl.id)::text as value
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at < (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id
  )

UNION ALL

-- 4. Check for current week unsettled ledgers
SELECT
  'CURRENT_UNSETTLED_COUNT' as metric,
  count(dfl.id)::text as value
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at >= (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND dfl.occurred_at < (DATE '2026-09-21' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id
  )
  
UNION ALL

-- 5. Check net amount constraints
SELECT 
  'CONSTRAINT_NET_AMOUNT' as metric,
  pg_get_constraintdef(c.oid) as value
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'driver_settlements' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%net_amount%';
