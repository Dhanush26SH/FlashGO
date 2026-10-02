# Expiry Workflow Investigation Report

## 1. What exact condition makes a product batch appear under Warehouse Staff -> Expiry -> Expired Inventory Tasks?
For a batch to appear, it must satisfy the following conditions based on the frontend query (`mobile-staff/src/screens/Warehouse/ExpiryTaskWorkflow.tsx`, lines 50-53):
- It belongs to the current staff's `warehouse_id`.
- `status` = `'active'`
- `available_quantity` > `0`
- `expiry_date` is strictly less than today's date (`< today`), where `today` is calculated as `new Date().toISOString().split('T')[0]`.

## 2. Does a task appear: before expiry, on the expiry date, or only after the expiry timestamp/date has passed?
It appears **only after the expiry date has passed**.
The query uses `.lt('expiry_date', today)`. This means if a batch expires on `2026-10-02`, and today is `2026-10-02`, it does *not* qualify because it is not strictly less than today. It will only appear on `2026-10-03`.

## 3. Identify the exact existing frontend screen/component responsible for this Expiry task UI.
The exact frontend component is **`ExpiryTaskWorkflow.tsx`** located at `mobile-staff/src/screens/Warehouse/ExpiryTaskWorkflow.tsx`.

## 4. Identify the exact tables, RPCs/functions and queries used by this workflow.
**Tables used:**
- `product_batches`
- `warehouse_product_placements`
- `warehouse_locations`
- `products`
- `profiles`
- `warehouse_stock`
- `stock_ledgers`

**RPC used:**
- `remove_expired_batch_inventory` (defined in `supabase/migrations/20260922000015_stock_ledger_provenance.sql`)
- `admin_create_warehouse_audit` (if staff reports discrepancy)

## 5. Explain the existing lifecycle
1. **Eligible batch**: A product batch becomes eligible at midnight when its `expiry_date` falls strictly behind the current date, provided `status` is `'active'` and `available_quantity` > 0.
2. **Warehouse Staff task**: The `ExpiryTaskWorkflow` screen queries `product_batches` and enriches them by finding their physical candidate placements from `warehouse_product_placements`, presenting them as tasks to staff with the `damage_expiry` duty.
3. **Scan/verification**: The staff member must scan the location QR code first, followed by the product's internal barcode or standard barcode, verifying they are physically at the right spot with the right product.
4. **Physical removal**: The staff inputs the quantity being physically removed. The app calls the `remove_expired_batch_inventory` RPC.
5. **Inventory update**: The RPC reduces `warehouse_product_placements.quantity`, `product_batches.available_quantity`, and `warehouse_stock.quantity`. It writes an entry to `stock_ledgers`.
6. **Expired quantity/status**: If the batch's `available_quantity` reaches 0, its `status` is immediately updated to `'depleted'`.

## 6. Identify exactly what database quantities/ledgers are changed when Warehouse Staff completes an expiry task.
When `remove_expired_batch_inventory` runs successfully:
- `warehouse_product_placements.quantity` is decremented by the removed quantity.
- `product_batches.available_quantity` is decremented by the removed quantity.
- `warehouse_stock.quantity` (global stock) is decremented by the removed quantity.
- `stock_ledgers` gets an INSERT record with `quantity_change` = negative removed quantity, `reason` = `'expired'`, and `reference_type` = `'expiry_workflow'`.

## 7. Verify whether FEFO/customer availability/picker availability automatically excludes expired stock and how.
- **Picker Availability (FEFO)**: **YES.** `pick_fefo_item` (used by pickers) strictly enforces `AND expiry_date >= CURRENT_DATE`. Pickers physically cannot be assigned expired stock.
- **Customer Availability**: **NO.** Customer checkout uses `get_sellable_quantity` (which subtracts `inventory_reservations` from `warehouse_stock.quantity`). Since expired stock remains in `warehouse_stock.quantity` until a Warehouse Staff *physically removes it*, it is technically considered available for customer purchase on the frontend. If a customer orders it before it is removed, the order goes through, but the picker will fail to fulfill it since `pick_fefo_item` blocks picking expired stock.

## 8. Check whether there are already genuine currently eligible expired batches/tasks in Udupi FlashGO Store.
I queried the database directly using the service role key for the Udupi warehouse (`9f4d3149-f3e4-432b-98b6-f17af77c9c33`). 
Currently, there are **0 eligible expired batches** in the Udupi warehouse for today (`2026-10-02`). There are no genuine tasks available for physical testing today.

## 9. For the visible genuine batch FG-BATCH-20261002-D117 (Nandini Paneer, expiry 05/10/2026), explain why it currently does or does not qualify.
This batch **does NOT qualify** for the expiry task currently.
The frontend strictly mandates that `expiry_date` must be less than the current date (`.lt('expiry_date', today)`). Because today is `2026-10-02` and the batch's expiry date is `2026-10-05`, the condition `2026-10-05 < 2026-10-02` evaluates to false. This batch will only appear in the workflow starting on `2026-10-06`.
