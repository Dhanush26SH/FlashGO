-- Migration B: One-time Guarded Active-Assignment Rebalance

DO $$
DECLARE
    v_bob_id UUID := '718a6efa-7364-44bd-b0c9-2106e44585c3';
    v_test_order_id UUID := '7a6a9d35-fa05-4c30-9a75-476fe8eb6228';
BEGIN
    -- Unassign all 'placed' or 'picking' orders for Bob EXCEPT the specific manual test order.
    -- This enforces the new one-active-task rule without deleting orders or changing inventory.
    UPDATE public.orders
    SET picker_id = NULL
    WHERE picker_id = v_bob_id
      AND status IN ('placed', 'picking')
      AND id != v_test_order_id;
END;
$$;
