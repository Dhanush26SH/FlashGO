-- Replace driver_financial_summary view with COALESCE handling for correct signing
CREATE OR REPLACE VIEW public.driver_financial_summary WITH (security_invoker = true) AS
SELECT
  driver_id,
  COALESCE(SUM(amount), 0) AS pocket_balance,
  COALESCE(SUM(CASE WHEN transaction_type IN ('cod_collection', 'cod_settlement') THEN -amount ELSE 0 END), 0) AS unsettled_cod,
  COALESCE(SUM(CASE WHEN transaction_type = 'delivery_earning' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN amount ELSE 0 END), 0) AS weekly_earnings,
  COALESCE(SUM(CASE WHEN transaction_type = 'customer_tip' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN amount ELSE 0 END), 0) AS weekly_tips,
  COALESCE(SUM(CASE WHEN transaction_type = 'penalty' AND occurred_at >= date_trunc('week', timezone('utc', now())) THEN -amount ELSE 0 END), 0) AS weekly_deductions
FROM public.driver_financial_ledger
GROUP BY driver_id;
