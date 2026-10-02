# F&V Quality Removal Investigation Report

## 1. Exact Frontend Function/RPC Invoked
When a Warehouse Staff member confirms the removal for "Rotten / Spoiled", "Damaged / Bruised", or "Poor Quality / Unfit", the frontend function **`submitRemoval`** (in `mobile-staff/src/screens/Warehouse/FnvTaskWorkflow.tsx`) is invoked. This function calls the Supabase RPC **`remove_fnv_batch_inventory`**.

## 2. Where `damaged_quantity` is Referenced
The reference to `damaged_quantity` causing the error is inside the **`remove_fnv_batch_inventory`** RPC (specifically defined in the migration `20260922000015_stock_ledger_provenance.sql`). 
It attempts to update a `damaged_quantity` column on the `product_batches` table:
```sql
    UPDATE public.product_batches 
    SET available_quantity = available_quantity - p_removed_qty,
        damaged_quantity = damaged_quantity + p_removed_qty, -- <--- ERROR CAUSE
        status = CASE WHEN available_quantity - p_removed_qty <= 0 THEN 'depleted' ELSE status END
    WHERE id = p_batch_id;
```

## 3. Actual Current Schemas
I inspected the actual live schemas of the relevant tables:
- **`product_batches`**: Does **not** have a `damaged_quantity` column. (Columns: `id`, `product_id`, `warehouse_id`, `batch_number`, `expiry_date`, `received_quantity`, `available_quantity`, `status`, `created_at`, `goods_receipt_item_id`, `staging_quantity`).
- **`warehouse_stock`**: Does **not** have a `damaged_quantity` column.
- **`warehouse_product_placements`**: Does **not** have a `damaged_quantity` column.
- **`goods_receipt_items`**: This is the only table that **does** have a `damaged_quantity` column (used during inwarding).

## 4. Origin of `damaged_quantity`
It belongs to another table (`goods_receipt_items`), where it is used heavily for inward receiving. Its inclusion in the `product_batches` UPDATE within this F&V removal RPC is an incorrect stale reference or a feature that was never fully implemented (as the comment explicitly says `accumulate damaged quantity semantics if they exist`). It does not exist on `product_batches`.

## 5. Current RPC Responsibilities
The `remove_fnv_batch_inventory` RPC reads and writes the following:
- **Reads**: `profiles`, `staff_shifts`, `product_batches` (FOR UPDATE), `products`, `warehouse_product_placements` (FOR UPDATE), `warehouse_stock` (FOR UPDATE).
- **Writes**:
  - `warehouse_product_placements` (Decrements `quantity`)
  - `product_batches` (Decrements `available_quantity`, attempts to increment `damaged_quantity`, updates `status`)
  - `warehouse_stock` (Decrements `quantity`)
  - `stock_ledgers` (Inserts a record for the removal)

## 6. Do Other Reasons Hit the Same Failure?
**Yes.** The frontend maps "Rotten / Spoiled", "Damaged / Bruised", and "Poor Quality / Unfit" to the string values `'spoiled'`, `'damaged'`, and `'quality_issue'`. The RPC validates these three reasons and then proceeds to execute the exact same SQL logic for all of them. Therefore, all three quality issues will hit the exact same `damaged_quantity does not exist` failure.

## 7. Did the Failed Attempt Cause Partial Mutation?
**No.** PostgreSQL functions (`LANGUAGE plpgsql`) run within an implicit transaction. When the engine encounters the missing column error during the `UPDATE public.product_batches` step, the entire transaction is immediately aborted and rolled back. The preceding update to `warehouse_product_placements` was safely reversed, meaning placement quantity, batch available quantity, warehouse stock, and the stock ledger all remained completely unchanged.

## 8. Minimal Forward-Only Repair
The smallest forward-only repair is to create a new SQL migration that runs `CREATE OR REPLACE FUNCTION public.remove_fnv_batch_inventory(...)` with the exact same existing logic, but with the line `damaged_quantity = damaged_quantity + p_removed_qty,` removed from the `UPDATE public.product_batches` statement. This will restore the intended F&V behavior without altering any business logic.
