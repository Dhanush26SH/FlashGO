-- Migration: 20260814000003_add_payment_method.sql

-- Verify that existing orders can safely receive the default 'cod' without issue.
-- Because DEFAULT 'cod' is safe for retroactive compatibility with mock data, we add the column safely.
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'wallet'));

-- NOTE: cod_collected is already not part of the schema and is inferred in FlashGoDB, 
-- but we rely solely on the payment_method for COD liability checks.
