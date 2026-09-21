WITH driver AS (
  SELECT id FROM public.profiles WHERE role = 'driver' AND full_name ILIKE '%Driver1%' LIMIT 1
)
SELECT 
  'OLD_ELIGIBLE' as metric,
  transaction_type,
  amount,
  occurred_at,
  occurred_at AT TIME ZONE 'Asia/Kolkata' as occurred_at_ist
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at < ('2026-09-14 00:00:00+05:30')::TIMESTAMPTZ
  AND dfl.transaction_type IN ('delivery_earning', 'customer_tip', 'incentive', 'penalty', 'adjustment')
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id
  )

UNION ALL

SELECT 
  'OLD_COD' as metric,
  transaction_type,
  amount,
  occurred_at,
  occurred_at AT TIME ZONE 'Asia/Kolkata' as occurred_at_ist
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at < ('2026-09-14 00:00:00+05:30')::TIMESTAMPTZ
  AND dfl.transaction_type = 'cod_collection'
