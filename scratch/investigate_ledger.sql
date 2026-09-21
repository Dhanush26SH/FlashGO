WITH driver AS (
  SELECT id FROM public.profiles WHERE role = 'driver' AND full_name ILIKE '%Driver1%' LIMIT 1
)
SELECT 
  dfl.transaction_type, 
  dfl.amount, 
  dfl.occurred_at,
  (SELECT settlement_id FROM public.driver_settlement_items dsi WHERE dsi.ledger_id = dfl.id LIMIT 1) as settlement_id
FROM public.driver_financial_ledger dfl
WHERE dfl.driver_id = (SELECT id FROM driver)
  AND dfl.occurred_at >= (DATE '2026-09-14' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
  AND dfl.occurred_at < (DATE '2026-09-21' + INTERVAL '0' HOUR - INTERVAL '5.5' HOUR)
ORDER BY dfl.occurred_at ASC;
