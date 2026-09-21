-- Verification Script
WITH driver AS (
  SELECT id FROM public.profiles WHERE role = 'driver' AND full_name ILIKE '%Driver1%' LIMIT 1
)
SELECT 
  'A_OLD_UNSETTLED_ELIGIBLE_ROWS' as metric,
  count(dfl.id)::text as value
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at < (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND dfl.transaction_type IN ('delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment')
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id
  )

UNION ALL

SELECT 
  'C_CURRENT_UNSETTLED_ELIGIBLE_ROWS' as metric,
  count(dfl.id)::text as value
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at >= (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND dfl.occurred_at < (DATE '2026-09-21' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND dfl.transaction_type IN ('delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment')
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id
  )

UNION ALL

SELECT 
  'D_SETTLEMENT_CREATED' as metric,
  count(id)::text as value
FROM public.driver_settlements
WHERE driver_id = (SELECT id FROM driver) AND week_start = '2026-09-14'

UNION ALL

SELECT 
  'E_HISTORICAL_COD_EXISTS' as metric,
  count(id)::text as value
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.transaction_type = 'cod_collection'
  AND dfl.occurred_at < (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
