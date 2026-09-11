-- Migration: 20260814000002_fix_inventory_rpc.sql

-- 1. Add deduplication flag to orders to prevent double-deduction
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN DEFAULT false;

-- 2. Re-create the RPC safely
CREATE OR REPLACE FUNCTION deduct_inventory_for_order(
    p_order_id UUID,
    p_warehouse_id UUID,
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    item RECORD;
    v_stock INTEGER;
    v_already_deducted BOOLEAN;
    sub RECORD;
BEGIN
    -- Check if already deducted and lock the order row
    SELECT inventory_deducted INTO v_already_deducted 
    FROM public.orders 
    WHERE id = p_order_id FOR UPDATE;
    
    IF v_already_deducted = true THEN
        RETURN FALSE; -- Already deducted, gracefully prevent double deduction
    END IF;

    -- Process normal order items
    FOR item IN 
        SELECT id as order_item_id, product_id, quantity, picked_quantity 
        FROM public.order_items 
        WHERE order_id = p_order_id
    LOOP
        -- Deduct actually picked quantity (ignores OOS items which have picked_quantity = 0)
        IF item.picked_quantity > 0 THEN
            SELECT quantity INTO v_stock 
            FROM public.warehouse_stock 
            WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
            
            IF v_stock IS NULL OR v_stock < item.picked_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for product % (Requires %, Available %)', item.product_id, item.picked_quantity, COALESCE(v_stock, 0);
            END IF;

            UPDATE public.warehouse_stock 
            SET quantity = quantity - item.picked_quantity 
            WHERE product_id = item.product_id AND warehouse_id = p_warehouse_id;

            INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by)
            VALUES (p_warehouse_id, item.product_id, -item.picked_quantity, 'picking_order_' || p_order_id, p_user_id);
        END IF;

        -- Process approved substitutions for this order item
        FOR sub IN 
            SELECT suggested_product_id, quantity 
            FROM public.order_substitutions 
            WHERE order_id = p_order_id 
              AND order_item_id = item.order_item_id 
              AND status = 'approved'
        LOOP
            IF sub.quantity > 0 THEN
                SELECT quantity INTO v_stock 
                FROM public.warehouse_stock 
                WHERE product_id = sub.suggested_product_id AND warehouse_id = p_warehouse_id FOR UPDATE;
                
                IF v_stock IS NULL OR v_stock < sub.quantity THEN
                    RAISE EXCEPTION 'Insufficient stock for substitute product % (Requires %, Available %)', sub.suggested_product_id, sub.quantity, COALESCE(v_stock, 0);
                END IF;

                UPDATE public.warehouse_stock 
                SET quantity = quantity - sub.quantity 
                WHERE product_id = sub.suggested_product_id AND warehouse_id = p_warehouse_id;

                INSERT INTO public.stock_ledgers (warehouse_id, product_id, quantity_change, reason, performed_by)
                VALUES (p_warehouse_id, sub.suggested_product_id, -sub.quantity, 'sub_picking_order_' || p_order_id, p_user_id);
            END IF;
        END LOOP;
    END LOOP;

    -- Mark as deducted
    UPDATE public.orders SET inventory_deducted = true WHERE id = p_order_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
