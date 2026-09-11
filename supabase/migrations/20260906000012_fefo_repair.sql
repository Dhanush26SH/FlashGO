-- Part A: Udupi FEFO Reconciliation
-- Add missing batch provenance for products with physical stock but NO batches.
-- We use NOT EXISTS to ensure idempotency and ignore products that already have batches (like the 2 expired ones).

INSERT INTO public.product_batches (
    warehouse_id, 
    product_id, 
    batch_number, 
    expiry_date, 
    received_quantity, 
    available_quantity, 
    status
)
SELECT 
    ws.warehouse_id,
    ws.product_id,
    'BAT-UDP-' || substr(md5(random()::text), 1, 8),
    now() + interval '1 year',
    ws.quantity,
    ws.quantity,
    'active'
FROM public.warehouse_stock ws
WHERE ws.warehouse_id = '9f4d3149-f3e4-432b-98b6-f17af77c9c33'
  AND ws.quantity > 0
  AND NOT EXISTS (
      SELECT 1 FROM public.product_batches pb 
      WHERE pb.warehouse_id = ws.warehouse_id 
        AND pb.product_id = ws.product_id
  );

-- Part B: Manipal Initial Inventory
-- Initialize Manipal store with the same physical quantities as Udupi, but ALL as fresh active batches.

-- 1. Create warehouse_stock rows for Manipal
INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
SELECT 
    '76525a09-3fd1-4949-b45e-49c77255b4ce',
    ws.product_id,
    ws.quantity
FROM public.warehouse_stock ws
WHERE ws.warehouse_id = '9f4d3149-f3e4-432b-98b6-f17af77c9c33'
ON CONFLICT (warehouse_id, product_id) DO NOTHING;

-- 2. Create matching active product_batches for Manipal
INSERT INTO public.product_batches (
    warehouse_id, 
    product_id, 
    batch_number, 
    expiry_date, 
    received_quantity, 
    available_quantity, 
    status
)
SELECT 
    '76525a09-3fd1-4949-b45e-49c77255b4ce',
    ws.product_id,
    'BAT-MPL-' || substr(md5(random()::text), 1, 8),
    now() + interval '1 year',
    ws.quantity,
    ws.quantity,
    'active'
FROM public.warehouse_stock ws
WHERE ws.warehouse_id = '9f4d3149-f3e4-432b-98b6-f17af77c9c33'
  AND NOT EXISTS (
      SELECT 1 FROM public.product_batches pb 
      WHERE pb.warehouse_id = '76525a09-3fd1-4949-b45e-49c77255b4ce' 
        AND pb.product_id = ws.product_id
  );

-- 3. Create stock_ledgers entries for Manipal to record initial 'grn' (Goods Received Note)
-- Udupi ledger remains unchanged because we are only reconciling existing physical stock, 
-- and the ledger has no specific reason for "batch creation reconciliation".
INSERT INTO public.stock_ledgers (
    warehouse_id,
    product_id,
    quantity_change,
    reason
)
SELECT 
    '76525a09-3fd1-4949-b45e-49c77255b4ce',
    ws.product_id,
    ws.quantity,
    'grn'
FROM public.warehouse_stock ws
WHERE ws.warehouse_id = '9f4d3149-f3e4-432b-98b6-f17af77c9c33'
  AND NOT EXISTS (
      SELECT 1 FROM public.stock_ledgers sl 
      WHERE sl.warehouse_id = '76525a09-3fd1-4949-b45e-49c77255b4ce' 
        AND sl.product_id = ws.product_id
  );
